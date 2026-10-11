-- Advisor 0011: pin search_path on the constant helper from 0005.
alter function public.video_free_seconds() set search_path = public;
