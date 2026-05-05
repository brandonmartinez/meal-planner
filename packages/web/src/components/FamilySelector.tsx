import { useFamily } from '../hooks/useFamily';

export default function FamilySelector() {
  const { familyId, families, switchFamily } = useFamily();

  if (families.length <= 1) return null;

  return (
    <select
      value={familyId ?? ''}
      onChange={e => switchFamily(e.target.value)}
      className="text-sm bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="Select family"
    >
      {families.map(f => (
        <option key={f.id} value={f.id}>{f.name}</option>
      ))}
    </select>
  );
}
