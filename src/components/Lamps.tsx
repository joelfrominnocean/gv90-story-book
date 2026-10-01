/** The two-line lamp signature: page divider, and loading indicator when `loading`. */
export function Lamps({ loading = false, dim = false }: { loading?: boolean; dim?: boolean }) {
  return (
    <div className={`lamps${loading ? " lamps--loading" : ""}${dim ? " lamps--dim" : ""}`} aria-hidden="true">
      <i />
      <i />
    </div>
  );
}
