import { createClient, type User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const supabaseConfigured = Boolean(supabase);

export async function signUp(email:string,password:string){
  if(!supabase) return {user:null,error:new Error("Supabase nie jest skonfigurowane.")};
  const {data,error}=await supabase.auth.signUp({email,password});
  return {user:data.user,error};
}
export async function signIn(email:string,password:string){
  if(!supabase) return {user:null,error:new Error("Supabase nie jest skonfigurowane.")};
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  return {user:data.user,error};
}
export async function signOut(){
  if(!supabase) return {error:new Error("Supabase nie jest skonfigurowane.")};
  return supabase.auth.signOut();
}
export async function getCurrentUser():Promise<User|null>{
  if(!supabase) return null;
  const {data}=await supabase.auth.getUser();
  return data.user;
}
