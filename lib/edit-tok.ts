import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type CloudEdit = {
  id: string;
  owner_id: string;
  title: string;
  tag: string | null;
  storage_path: string | null;
  duration_seconds: number | null;
  play_count: number;
  allow_download: boolean;
  rights_confirmed: boolean;
  created_at: string;
  profiles?: { username: string; display_name: string } | null;
};

export const EDITS_BUCKET = "edits";

export async function listPublicEdits() {
  if (!supabase) return { data: [] as CloudEdit[], error: null };
  const { data, error } = await supabase
    .from("edits")
    .select("id,owner_id,title,tag,storage_path,duration_seconds,play_count,allow_download,rights_confirmed,created_at,profiles(username,display_name),likes(count)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);
  return { data: (data ?? []) as CloudEdit[], error };
}

export async function createCloudEdit(args: {
  user: User;
  file: File;
  title: string;
  tag: string;
  allowDownload: boolean;
  rightsConfirmed: boolean;
  durationSeconds?: number;
}) {
  if (!supabase) return { data: null, error: new Error("Supabase nie jest skonfigurowane.") };

  const { data: edit, error: insertError } = await supabase
    .from("edits")
    .insert({
      owner_id: args.user.id,
      title: args.title,
      tag: args.tag,
      duration_seconds: args.durationSeconds ?? null,
      allow_download: args.allowDownload,
      rights_confirmed: args.rightsConfirmed,
      is_public: true,
    })
    .select("id")
    .single();

  if (insertError || !edit) return { data: null, error: insertError ?? new Error("Nie udało się utworzyć editu.") };

  const path = `${args.user.id}/${edit.id}/audio`;
  const { error: uploadError } = await supabase.storage
    .from(EDITS_BUCKET)
    .upload(path, args.file, {
      contentType: args.file.type || "audio/wav",
      upsert: false,
    });

  if (uploadError) {
    await supabase.from("edits").delete().eq("id", edit.id).eq("owner_id", args.user.id);
    return { data: null, error: uploadError };
  }

  const { data: saved, error: updateError } = await supabase
    .from("edits")
    .update({ storage_path: path })
    .eq("id", edit.id)
    .eq("owner_id", args.user.id)
    .select()
    .single();

  if (updateError) {
    await supabase.storage.from(EDITS_BUCKET).remove([path]);
    await supabase.from("edits").delete().eq("id", edit.id).eq("owner_id", args.user.id);
    return { data: null, error: updateError };
  }

  return { data: saved as CloudEdit, error: null };
}

export async function getEditAudioUrl(editId: string, download = false) {
  if (!supabase) return { data: null, error: new Error("Supabase nie jest skonfigurowane.") };
  const { data, error } = await supabase.functions.invoke("get-edit-audio-url", {
    body: { editId, download },
  });
  if (error) return { data: null, error };
  return { data: data?.url ? { signedUrl: data.url } : null, error: data?.error ? new Error(data.error) : null };
}

export async function toggleCloudLike(userId: string, editId: string, liked: boolean) {
  if (!supabase) return { error: new Error("Supabase nie jest skonfigurowane.") };
  if (liked) {
    const { error } = await supabase.from("likes").delete().eq("user_id", userId).eq("edit_id", editId);
    return { error };
  }
  const { error } = await supabase.from("likes").insert({ user_id: userId, edit_id: editId });
  return { error };
}

export async function incrementCloudPlay(editId: string) {
  if (!supabase) return { data: null, error: new Error("Supabase nie jest skonfigurowane.") };
  const { data, error } = await supabase.rpc("increment_edit_play", { p_edit_id: editId });
  return { data: typeof data === "number" ? data : Number(data ?? 0), error };
}

export async function listCloudLikes(userId: string) {
  if (!supabase) return { data: [] as string[], error: null };
  const { data, error } = await supabase.from("likes").select("edit_id").eq("user_id", userId);
  return { data: (data ?? []).map((row) => row.edit_id as string), error };
}

export async function listCloudComments(editId: string) {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase
    .from("comments")
    .select("id,body,created_at,profiles(username,display_name)")
    .eq("edit_id", editId)
    .order("created_at", { ascending: true })
    .limit(100);
  return { data: data ?? [], error };
}

export async function addCloudComment(userId: string, editId: string, body: string) {
  if (!supabase) return { data: null, error: new Error("Supabase nie jest skonfigurowane.") };
  const { data, error } = await supabase
    .from("comments")
    .insert({ user_id: userId, edit_id: editId, body: body.trim() })
    .select("id,body,created_at,profiles(username,display_name)")
    .single();
  return { data, error };
}

export async function reportCloudEdit(userId: string, editId: string, reason = "reported_by_user") {
  if (!supabase) return { error: new Error("Supabase nie jest skonfigurowane.") };
  const { error } = await supabase.from("reports").insert({
    reporter_id: userId,
    edit_id: editId,
    reason,
  });
  return { error };
}
