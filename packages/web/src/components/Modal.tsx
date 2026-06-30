import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

interface ModalProps {
    /** Called when the user requests dismissal (Escape key, backdrop click, or a consumer-provided control). */
    onClose: () => void;
    /** id of the visible heading that labels this dialog (wired to aria-labelledby). */
    labelledBy: string;
    /** Tailwind classes for the full-screen overlay / backdrop. */
    overlayClassName?: string;
    /** Tailwind classes for the dialog panel. */
    className?: string;
    /** When true (default), clicking the backdrop outside the panel dismisses the dialog. */
    closeOnBackdropClick?: boolean;
    children: ReactNode;
}

// Elements that can receive keyboard focus, used to implement the focus trap.
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Accessible modal dialog primitive.
 *
 * Provides the shared a11y contract for our dialogs:
 *  - role="dialog" + aria-modal="true", labelled by the visible heading.
 *  - On open, focus moves into the dialog. Consumers may mark a preferred
 *    initial focus target with `data-autofocus`; otherwise the panel itself
 *    receives focus.
 *  - Focus is trapped within the dialog: Tab / Shift+Tab cycle through the
 *    focusable elements inside the panel and never escape to the page behind.
 *  - On close, focus returns to the element that was focused when the dialog
 *    opened (typically the trigger button).
 *  - Escape closes the dialog; clicking the backdrop closes it by default.
 *
 * Styling is left to consumers via `overlayClassName` / `className` so existing
 * visuals stay pixel-identical.
 */
export default function Modal({
    onClose,
    labelledBy,
    overlayClassName,
    className,
    closeOnBackdropClick = true,
    children,
}: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<Element | null>(null);

    // Focus management: capture the trigger on open, move focus in, restore on close.
    useEffect(() => {
        triggerRef.current = document.activeElement;
        const preferred = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]');
        (preferred ?? panelRef.current)?.focus();

        return () => {
            const trigger = triggerRef.current;
            if (trigger instanceof HTMLElement && document.contains(trigger)) {
                trigger.focus();
            }
        };
        // Run once on mount/unmount — focus capture must reflect open-time state.
    }, []);

    // Escape closes the dialog. Bound to the document so it fires regardless of
    // which element inside the dialog currently holds focus.
    useEffect(() => {
        const onKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    // Focus trap: keep Tab / Shift+Tab cycling inside the panel.
    const handlePanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'Tab') return;
        const panel = panelRef.current;
        if (!panel) return;

        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusables.length === 0) {
            // Nothing focusable inside — keep focus on the panel itself.
            e.preventDefault();
            panel.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || !panel.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    };

    const handleOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
        // Only dismiss when the backdrop itself is clicked, not content within the panel.
        if (closeOnBackdropClick && e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className={overlayClassName} onClick={handleOverlayClick}>
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                tabIndex={-1}
                className={className}
                onKeyDown={handlePanelKeyDown}
            >
                {children}
            </div>
        </div>
    );
}
