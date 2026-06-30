import { useRef, useState, useId } from 'react';
import { importMeals, type ImportMealsResultDTO } from '../api/meals';
import { parseMealsCSV, type ParsedImportMeal } from '../utils/csv';
import Modal from './Modal';

interface Props {
    familyId: string;
    onClose: () => void;
    onImported: () => void;
}

const TEMPLATE_CSV = `meal,description,ingredient,quantity,unit,category
`;

const SAMPLE_CSV = `meal,description,ingredient,quantity,unit,category
Spaghetti Bolognese,Classic Italian pasta,spaghetti,1,lb,pantry
Spaghetti Bolognese,,ground beef,1,lb,meat
Spaghetti Bolognese,,tomato sauce,24,oz,pantry
Taco Tuesday,Family favorite,ground beef,1,lb,meat
Taco Tuesday,,taco shells,12,,pantry
Taco Tuesday,,shredded cheese,8,oz,dairy`;

function downloadCSV(filename: string, contents: string) {
    const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export default function ImportMealsDialog({ familyId, onClose, onImported }: Props) {
    const [csvText, setCsvText] = useState('');
    const [mode, setMode] = useState<'skip' | 'replace'>('skip');
    const [preview, setPreview] = useState<ParsedImportMeal[] | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [result, setResult] = useState<ImportMealsResultDTO | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const headingId = useId();
    const csvTextId = useId();
    const modeId = useId();

    const handleFile = async (file: File) => {
        const text = await file.text();
        setCsvText(text);
        runParse(text);
    };

    const runParse = (text: string) => {
        setError('');
        setResult(null);
        if (!text.trim()) {
            setPreview(null);
            setWarnings([]);
            return;
        }
        const parsed = parseMealsCSV(text);
        setPreview(parsed.meals);
        setWarnings(parsed.warnings);
    };

    const handleSubmit = async () => {
        if (!preview || preview.length === 0) {
            setError('Nothing to import. Add CSV content first.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const res = await importMeals(familyId, preview, mode);
            setResult(res);
            if (res.errors.length === 0) {
                onImported();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setSubmitting(false);
        }
    };

    const ingredientCount = preview?.reduce((sum, m) => sum + (m.ingredients?.length ?? 0), 0) ?? 0;

    return (
        <Modal
            onClose={onClose}
            labelledBy={headingId}
            overlayClassName="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4"
            className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 id={headingId} className="text-xl font-semibold">Import Meals from CSV</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none"
                        aria-label="Close import dialog"
                    >
                        ×
                    </button>
                </div>

                <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                        <p className="mb-2">
                            Upload or paste a CSV with these columns (header row required):{' '}
                            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">meal</code>,{' '}
                            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">description</code>,{' '}
                            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">ingredient</code>,{' '}
                            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">quantity</code>,{' '}
                            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">unit</code>,{' '}
                            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">category</code>.
                        </p>
                        <p className="mb-2">
                            Use one row per ingredient. Repeat the meal name to add multiple ingredients to the
                            same meal. Only <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">meal</code> is required.
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setCsvText(SAMPLE_CSV);
                                runParse(SAMPLE_CSV);
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                            Load example
                        </button>
                        <span className="text-gray-300 dark:text-gray-600 mx-2">|</span>
                        <button
                            type="button"
                            onClick={() => downloadCSV('meals-template.csv', TEMPLATE_CSV)}
                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                            Download empty template
                        </button>
                        <span className="text-gray-300 dark:text-gray-600 mx-2">|</span>
                        <button
                            type="button"
                            onClick={() => downloadCSV('meals-template-example.csv', SAMPLE_CSV)}
                            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                            Download example template
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleFile(file);
                            }}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm"
                        >
                            Choose CSV file…
                        </button>
                        <span className="text-sm text-gray-500 dark:text-gray-400">or paste below</span>
                    </div>

                    <label htmlFor={csvTextId} className="sr-only">CSV content</label>
                    <textarea
                        id={csvTextId}
                        value={csvText}
                        onChange={e => {
                            setCsvText(e.target.value);
                            runParse(e.target.value);
                        }}
                        rows={8}
                        placeholder="Paste CSV content here..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded font-mono text-xs"
                    />

                    <div>
                        <label htmlFor={modeId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            When a meal with the same name already exists
                        </label>
                        <select
                            id={modeId}
                            value={mode}
                            onChange={e => setMode(e.target.value as 'skip' | 'replace')}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded text-sm"
                        >
                            <option value="skip">Skip (keep existing meal)</option>
                            <option value="replace">Replace (overwrite description and ingredients)</option>
                        </select>
                    </div>

                    {warnings.length > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 p-3 rounded text-sm">
                            <p className="font-medium mb-1">Warnings</p>
                            <ul className="list-disc list-inside space-y-0.5">
                                {warnings.slice(0, 5).map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                                {warnings.length > 5 && <li>…and {warnings.length - 5} more</li>}
                            </ul>
                        </div>
                    )}

                    {preview && preview.length > 0 && (
                        <div className="border border-gray-200 dark:border-gray-700 rounded">
                            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-sm font-medium">
                                Preview: {preview.length} meal{preview.length === 1 ? '' : 's'}, {ingredientCount}{' '}
                                ingredient{ingredientCount === 1 ? '' : 's'}
                            </div>
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-48 overflow-y-auto text-sm">
                                {preview.map((m, i) => (
                                    <li key={i} className="px-3 py-2">
                                        <div className="font-medium">{m.name}</div>
                                        {m.description && <div className="text-gray-600 dark:text-gray-400 text-xs">{m.description}</div>}
                                        {m.ingredients && m.ingredients.length > 0 && (
                                            <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                                                {m.ingredients.length} ingredient
                                                {m.ingredients.length === 1 ? '' : 's'}:{' '}
                                                {m.ingredients.map(i => i.name).join(', ')}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {error && <div role="alert" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded text-sm">{error}</div>}

                    {result && (
                        <div role="status" className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 p-3 rounded text-sm">
                            <p className="font-medium mb-1">Import complete</p>
                            <p>
                                Created: {result.created} · Updated: {result.updated} · Skipped: {result.skipped}
                                {result.errors.length > 0 ? ` · Errors: ${result.errors.length}` : ''}
                            </p>
                            {result.errors.length > 0 && (
                                <ul className="list-disc list-inside mt-2 text-red-700 dark:text-red-300">
                                    {result.errors.slice(0, 5).map((e, i) => (
                                        <li key={i}>
                                            {e.name}: {e.error}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                        {result ? 'Close' : 'Cancel'}
                    </button>
                    {!result && (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting || !preview || preview.length === 0}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {submitting
                                ? 'Importing…'
                                : preview && preview.length > 0
                                    ? `Import ${preview.length} meal${preview.length === 1 ? '' : 's'}`
                                    : 'Import'}
                        </button>
                    )}
                </div>
        </Modal>
    );
}
