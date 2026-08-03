import type { TabularRecipeMealDTO } from '@meal-planner/shared';
import { buildTabularRecipe } from '../utils/buildTabularRecipe';
import { shortStepLabel, isRedundantSubLabel } from '../utils/shortStepLabel';

/** Left-border accent colours for ingredient group runs, rotated by run index
 *  (mirrors the prototype's g0..g3 accent / link / warning / success). */
const GROUP_BORDER = [
  'border-l-blue-500',
  'border-l-amber-500',
  'border-l-emerald-500',
  'border-l-rose-500',
];

/** Compose the muted quantity/unit prefix shown before the ingredient name. */
function quantityText(quantity: string | null, unit: string | null): string {
  return [quantity, unit]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * The Grid view (spec §1/§3.3/§9): a real, semantic tabular recipe. Ingredients
 * read top→bottom down the left column as `<th scope="row">`; each PROCESS step
 * is a rowspan `<td>` spanning exactly the ingredient rows it combines; SETUP
 * steps are full-width header bands; a FINISH note trails below. Every step cell
 * is `headers`-linked to its column header and the ingredient rows it spans so a
 * screen reader gets a coherent reading order across the rowspans. The List view
 * remains the lossless, accessible equivalent.
 */
export default function TabularRecipeView({ meal }: { meal: TabularRecipeMealDTO }) {
  const { setup, finish, columnCount, ingredientCount, rows } = buildTabularRecipe(meal);

  // A rowspan matrix needs ingredient rows to hang steps from.
  if (ingredientCount === 0) {
    return (
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        This recipe has no ingredients to chart yet.
      </p>
    );
  }

  const base = `tabular-${meal.id}`;
  const ingHeaderId = `${base}-col-ing`;
  const colHeaderId = (c: number) => `${base}-col-${c}`;
  const ingRowId = (r: number) => `${base}-row-${r}`;
  const totalCols = 1 + columnCount;

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border-2 border-blue-500/60 dark:border-blue-400/50">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Ingredients read down the left; each process step spans the ingredients
            it combines.
          </caption>
          <thead>
            {setup.map((band) => {
              const showSub = !isRedundantSubLabel(band.subLabel, band.text);
              return (
                <tr key={band.id}>
                  <th
                    scope="colgroup"
                    colSpan={totalCols}
                    className="border border-gray-300 bg-blue-100 px-3 py-2 text-center font-semibold text-gray-900 dark:border-gray-700 dark:bg-blue-900/40 dark:text-gray-100"
                  >
                    {band.text}
                    {band.subLabel && showSub && (
                      <span className="ml-2 font-medium text-gray-600 dark:text-gray-300">
                        {band.subLabel}
                      </span>
                    )}
                  </th>
                </tr>
              );
            })}
            {/* Screen-reader column headers so rowspan cells read with context. */}
            <tr>
              <th scope="col" id={ingHeaderId} className="sr-only">
                Ingredient
              </th>
              {Array.from({ length: columnCount }, (_, c) => (
                <th scope="col" id={colHeaderId(c)} key={c} className="sr-only">
                  Step {c + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const qty = quantityText(row.ingredient.quantity, row.ingredient.unit);
              const groupBorder =
                row.groupIndex != null
                  ? GROUP_BORDER[row.groupIndex % GROUP_BORDER.length]
                  : 'border-l-transparent';
              return (
                <tr key={row.ingredient.id}>
                  <th
                    scope="row"
                    id={ingRowId(row.rowIndex)}
                    className={`sticky left-0 z-10 border border-l-4 border-gray-300 bg-white px-3 py-2 text-left font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 ${groupBorder}`}
                  >
                    {row.isGroupStart && row.groupLabel && (
                      <span className="mr-2 inline-block rounded-full border border-blue-500 px-2 py-px text-[0.6rem] font-semibold uppercase tracking-wide text-blue-600 dark:border-blue-400 dark:text-blue-300">
                        {row.groupLabel}
                      </span>
                    )}
                    {qty && (
                      <span className="tabular-nums text-gray-500 dark:text-gray-400">
                        {qty}{' '}
                      </span>
                    )}
                    {row.ingredient.name}
                  </th>
                  {row.cells.map(({ column, cell }) => {
                    if (cell.kind === 'gap') {
                      return (
                        <td
                          key={column}
                          rowSpan={cell.rowSpan}
                          aria-hidden="true"
                          className="border border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40"
                        />
                      );
                    }
                    // Associate the step cell with its column header and every
                    // ingredient row it spans (row-major DOM order reads well).
                    const spannedRows = Array.from(
                      { length: cell.rowSpan },
                      (_, i) => ingRowId(row.rowIndex + i),
                    ).join(' ');
                    // Chu's format wants a terse verb in the box; the full step
                    // text stays one hover away (`title`) and lossless in List.
                    const label = shortStepLabel(cell.instruction.text);
                    const showSub = !isRedundantSubLabel(cell.instruction.subLabel, label);
                    return (
                      <td
                        key={column}
                        rowSpan={cell.rowSpan}
                        headers={`${colHeaderId(column)} ${spannedRows}`}
                        title={cell.instruction.text}
                        className="min-w-[6rem] border border-gray-300 bg-blue-50 px-3 py-2 text-center align-middle font-semibold text-blue-700 dark:border-gray-700 dark:bg-blue-900/20 dark:text-blue-300"
                      >
                        {label}
                        {cell.instruction.subLabel && showSub && (
                          <span className="mt-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                            {cell.instruction.subLabel}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {finish.length > 0 && (
        <div className="mt-3 space-y-1 px-1 text-sm text-gray-600 dark:text-gray-300">
          {finish.map((note) => (
            <p key={note.id}>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                Finish:
              </span>{' '}
              {note.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
