-- Board and piece designs per user. Some designs need Plus (or higher); the trigger enforces that on
-- every write, including direct updates through the profiles_update_self policy.
alter table public.profiles
  add column board_theme text not null default 'slate',
  add column piece_set   text not null default 'chessnut';

create or replace function public.check_appearance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  free_boards  text[] := array['slate', 'wood'];
  plus_boards  text[] := array['green', 'blue', 'marble', 'purple', 'night', 'coral'];
  free_pieces  text[] := array['chessnut', 'celtic', 'symbols'];
  plus_pieces  text[] := array['fantasy', 'spatial', 'rhosgfx', 'papercut'];
begin
  if tg_op = 'UPDATE' and new.board_theme is not distinct from old.board_theme
     and new.piece_set is not distinct from old.piece_set then
    return new;
  end if;
  if not (new.board_theme = any (free_boards || plus_boards)) or not (new.piece_set = any (free_pieces || plus_pieces)) then
    raise exception 'unknown_design';
  end if;
  if (new.board_theme = any (plus_boards) or new.piece_set = any (plus_pieces))
     and public.effective_plan(new.id) = 'free' then
    raise exception 'design_requires_plus';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_appearance() from public, anon, authenticated;

create trigger profiles_check_appearance
  before insert or update of board_theme, piece_set on public.profiles
  for each row execute function public.check_appearance();
