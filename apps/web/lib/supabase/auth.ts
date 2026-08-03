import { createBrowserSupabase } from "./client";

function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Email or password is incorrect.";
  }
  if (lower.includes("email not confirmed") || lower.includes("not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "An account with this email already exists.";
  }
  if (lower.includes("password")) {
    return "Password does not meet the requirements.";
  }
  if (lower.includes("rate limit")) {
    return "Too many emails were sent. Please wait a minute and try again.";
  }
  return "Something went wrong. Please try again.";
}

export async function signUp(input: { email: string; password: string; fullName: string }) {
  const supabase = createBrowserSupabase();
  const origin = window.location.origin;
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
    },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  return data;
}

export async function signIn(input: { email: string; password: string }) {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  return data;
}

export async function signOut() {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function resetPassword(email: string) {
  const supabase = createBrowserSupabase();
  const origin = window.location.origin;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function updatePassword(password: string) {
  const supabase = createBrowserSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function getSession() {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(friendlyAuthError(error.message));
  return data.session;
}

export async function getUser() {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(friendlyAuthError(error.message));
  return data.user;
}
