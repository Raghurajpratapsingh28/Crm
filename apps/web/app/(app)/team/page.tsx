import { Placeholder } from "../placeholder";

export default function Page() {
  return (
    <Placeholder
      title="Team"
      note="Invites go through Supabase Auth. Roles: ADMIN, MANAGER, MEMBER — enforced in Express."
    />
  );
}
