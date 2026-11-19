// Looks ContentRulesSettings reads: theme colors and styles it names, kept in src/ui/ (UC3.3).

// Native fields: the host Input fills its row, and a rule row needs three
// fields side by side.
export const fieldStyle = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--card, var(--bg))',
  color: 'var(--text)',
  padding: '4px 8px',
  fontSize: 13,
  minWidth: 0,
  width: '100%',
}

export const mono = { fontFamily: 'var(--mono, monospace)' }
