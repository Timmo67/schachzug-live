import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/** Players the user blocked, with a button to unblock. */
export function BlockedList({ me }: { me: string }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string }>>([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('friendships').select('addressee_id').eq('requester_id', me).eq('status', 'blocked');
    const ids = ((data ?? []) as Array<{ addressee_id: string }>).map((r) => r.addressee_id);
    if (!ids.length) { setRows([]); return; }
    const { data: ps } = await supabase.from('profiles').select('id, display_name').in('id', ids);
    setRows(((ps ?? []) as Array<{ id: string; display_name: string }>).map((p) => ({ id: p.id, name: p.display_name })));
  }, [me]);
  useEffect(() => { void load(); }, [load]);

  async function unblock(id: string) {
    if (!supabase) return;
    await supabase.rpc('respond_friend', { p_other: id, p_action: 'remove' });
    void load();
  }

  return (
    <>
      <h2>Blockiert</h2>
      {rows.length === 0 ? <p className="note">Du hast niemanden blockiert.</p> : (
        <div className="list" data-testid="blocked">
          {rows.map((r) => (
            <div className="item" key={r.id}>
              <span>{r.name}</span>
              <button type="button" onClick={() => void unblock(r.id)}>Aufheben</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
