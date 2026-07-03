import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../tests/msw/server';
import {
  MealImageField,
  type MealImageFieldHandle,
} from './MealImageField';

function pngFile(name = 'photo.png', bytes = 8): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

function bigFile(name = 'big.png'): File {
  // 5 MB + 1 byte — just over the client-side limit
  return new File([new Uint8Array(5 * 1024 * 1024 + 1)], name, { type: 'image/png' });
}

/** Controlled harness that mirrors how MealFormPage drives the field, and
 *  re-exposes the imperative handle so cleanup calls can be triggered in tests. */
const Harness = forwardRef<
  MealImageFieldHandle,
  {
    familyId?: string | null;
    initial?: string;
    mealId?: string;
    onChangeSpy?: (v: string) => void;
  }
>(function Harness(
  { familyId = 'f-1', initial = '', mealId, onChangeSpy },
  ref,
) {
  const [value, setValue] = useState(initial);
  const inner = useRef<MealImageFieldHandle>(null);
  useImperativeHandle(ref, () => ({
    commitCleanup: () => inner.current?.commitCleanup(),
    abandon: () => inner.current?.abandon(),
  }));
  return (
    <MealImageField
      ref={inner}
      familyId={familyId}
      value={value}
      mealId={mealId}
      onChange={next => {
        setValue(next);
        onChangeSpy?.(next);
      }}
    />
  );
});

/** Default happy-path handlers; individual tests override with server.use. */
function stubUpload(id = 'asset-new') {
  server.use(
    http.post('/api/families/f-1/images', () =>
      HttpResponse.json(
        {
          id,
          mealId: null,
          contentType: 'image/png',
          byteSize: 8,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        { status: 201 },
      ),
    ),
  );
}

describe('MealImageField', () => {
  it('uploads a selected file and emits the asset read-path, showing a preview', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    stubUpload('asset-1');
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.click(screen.getByLabelText('Upload'));
    await user.upload(screen.getByLabelText('Upload meal image'), pngFile());

    await waitFor(() =>
      expect(onChangeSpy).toHaveBeenCalledWith(
        '/api/families/f-1/images/asset-1',
      ),
    );
    expect(screen.getByText('Image uploaded.')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Meal image preview' }),
    ).toBeInTheDocument();
  });

  it('surfaces a validation failure and never emits an asset URL', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    server.use(
      http.post('/api/families/f-1/images', () =>
        HttpResponse.json(
          { error: 'Image exceeds the 5 MB limit.' },
          { status: 413 },
        ),
      ),
    );
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.click(screen.getByLabelText('Upload'));
    await user.upload(screen.getByLabelText('Upload meal image'), pngFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Image exceeds the 5 MB limit.',
    );
    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('img', { name: 'Meal image preview' }),
    ).not.toBeInTheDocument();
  });

  it('starts in Upload mode when mounted with a saved asset URL', () => {
    render(<Harness initial="/api/families/f-1/images/asset-saved" />);
    expect(screen.getByLabelText('Upload')).toBeChecked();
    expect(screen.getByLabelText('Link')).not.toBeChecked();
    // Preview of the saved asset is shown.
    expect(
      screen.getByRole('img', { name: 'Meal image preview' }),
    ).toBeInTheDocument();
  });

  it('starts in Link mode for a plain external URL and lets the user edit it', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(
      <Harness initial="https://cdn.example.com/a.png" onChangeSpy={onChangeSpy} />,
    );
    expect(screen.getByLabelText('Link')).toBeChecked();
    const input = screen.getByLabelText('Image URL');
    await user.type(input, 'x');
    expect(onChangeSpy).toHaveBeenLastCalledWith('https://cdn.example.com/a.pngx');
  });

  it('deletes the throwaway session asset when a second upload supersedes it', async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/families/f-1/images/:assetId', ({ params }) => {
        deleted.push(params.assetId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<Harness />);
    await user.click(screen.getByLabelText('Upload'));

    stubUpload('asset-a');
    await user.upload(screen.getByLabelText('Upload meal image'), pngFile('a.png'));
    await screen.findByText('Image uploaded.');

    stubUpload('asset-b');
    await user.upload(screen.getByLabelText('Upload meal image'), pngFile('b.png'));

    await waitFor(() => expect(deleted).toContain('asset-a'));
    expect(deleted).not.toContain('asset-b');
  });

  it('Remove clears the value and reaps the throwaway session asset', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/families/f-1/images/:assetId', ({ params }) => {
        deleted.push(params.assetId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    stubUpload('asset-x');
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.click(screen.getByLabelText('Upload'));
    await user.upload(screen.getByLabelText('Upload meal image'), pngFile());
    await screen.findByText('Image uploaded.');

    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(onChangeSpy).toHaveBeenLastCalledWith('');
    await waitFor(() => expect(deleted).toContain('asset-x'));
  });

  it('abandon() reaps a throwaway upload but commitCleanup() does not touch it', async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/families/f-1/images/:assetId', ({ params }) => {
        deleted.push(params.assetId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const handle = { current: null as MealImageFieldHandle | null };
    stubUpload('asset-abandon');
    render(<Harness ref={handle} />);

    await user.click(screen.getByLabelText('Upload'));
    await user.upload(screen.getByLabelText('Upload meal image'), pngFile());
    await screen.findByText('Image uploaded.');

    handle.current?.abandon();
    await waitFor(() => expect(deleted).toContain('asset-abandon'));
  });

  it('commitCleanup() reaps the replaced saved asset after a successful save', async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/families/f-1/images/:assetId', ({ params }) => {
        deleted.push(params.assetId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const handle = { current: null as MealImageFieldHandle | null };
    render(
      <Harness ref={handle} initial="/api/families/f-1/images/asset-old" />,
    );

    // Replace the saved asset with a fresh upload.
    stubUpload('asset-fresh');
    await user.upload(screen.getByLabelText('Upload meal image'), pngFile());
    await screen.findByText('Image uploaded.');

    // Before save, the old saved asset must NOT be deleted yet.
    expect(deleted).not.toContain('asset-old');

    // After a successful save, the parent commits cleanup.
    handle.current?.commitCleanup();
    await waitFor(() => expect(deleted).toContain('asset-old'));
  });

  it('does not delete external URLs on Remove', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/families/f-1/images/:assetId', ({ params }) => {
        deleted.push(params.assetId as string);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(
      <Harness initial="https://cdn.example.com/a.png" onChangeSpy={onChangeSpy} />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(onChangeSpy).toHaveBeenLastCalledWith('');
    // No asset delete fired for an external URL.
    expect(deleted).toHaveLength(0);
  });

  // ── Dropzone tests ──────────────────────────────────────────────────────────

  it('shows the dropzone CTA with helper text in upload mode when no image', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('Upload'));
    expect(screen.getByText('PNG, JPEG, WebP, or GIF, up to 5 MB.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
  });

  it('applies drag-over highlight class and removes it on drag-leave', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('Upload'));

    const zone = screen.getByRole('button', { name: 'Upload image drop zone' });
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('border-blue-500');

    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain('border-blue-500');
  });

  it('dropping a file triggers the upload and shows a preview', async () => {
    const onChangeSpy = vi.fn();
    stubUpload('asset-drop');
    const user = userEvent.setup();
    render(<Harness onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByLabelText('Upload'));

    const zone = screen.getByRole('button', { name: 'Upload image drop zone' });
    const file = pngFile('dropped.png');
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [file] },
    });
    fireEvent(zone, dropEvent);

    await waitFor(() =>
      expect(onChangeSpy).toHaveBeenCalledWith('/api/families/f-1/images/asset-drop'),
    );
    expect(screen.getByRole('img', { name: 'Meal image preview' })).toBeInTheDocument();
  });

  it('rejects a file over 5 MB with a client-side error and never calls the API', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    const uploadCalled = vi.fn();
    server.use(
      http.post('/api/families/f-1/images', () => {
        uploadCalled();
        return HttpResponse.json({ id: 'nope' }, { status: 201 });
      }),
    );
    render(<Harness onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByLabelText('Upload'));
    await user.upload(screen.getByLabelText('Upload meal image'), bigFile());

    expect(await screen.findByRole('alert')).toHaveTextContent('5 MB');
    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(uploadCalled).not.toHaveBeenCalled();
  });

  it('shows image preview (not the dropzone CTA) when upload mode has an existing image', () => {
    render(<Harness initial="/api/families/f-1/images/asset-saved" />);
    expect(screen.getByRole('img', { name: 'Meal image preview' })).toBeInTheDocument();
    // The dropzone CTA should NOT be shown since we already have an image
    expect(screen.queryByText('PNG, JPEG, WebP, or GIF, up to 5 MB.')).not.toBeInTheDocument();
  });

  it('clicking the dropzone zone opens the file picker', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('Upload'));

    const zone = screen.getByRole('button', { name: 'Upload image drop zone' });
    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
