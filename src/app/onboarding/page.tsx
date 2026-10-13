import { Suspense } from "react";
import { saveProfile } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Card, Field, inputClass, PageSpinner } from "@/components/ui";
import { requireProfile } from "@/lib/auth";

export default function OnboardingPage(props: PageProps<"/onboarding">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ProfileForm searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ProfileForm({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const profile = await requireProfile("/onboarding");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : null;
  const name = profile.display_name ?? profile.full_name ?? "";

  return (
    <div className="mx-auto max-w-md">
      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={name || profile.email} src={profile.avatar_url} size={48} />
          <div>
            <h1 className="text-xl font-semibold">{profile.onboarded_at ? "Your profile" : "Welcome! 👋"}</h1>
            <p className="text-sm text-stone-500">{profile.email}</p>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <form action={saveProfile} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Display name" hint="Shown to other players on the attendee list.">
            <input name="display_name" defaultValue={name} required maxLength={60} className={inputClass} />
          </Field>
          <Field
            label="Name on your e-Transfers"
            hint="The name your bank shows when you send money (e.g. JANE DOE). Separate several with commas. This helps match your payment if you forget the code."
          >
            <input
              name="etransfer_names"
              defaultValue={profile.etransfer_names.join(", ") || name}
              maxLength={300}
              className={inputClass}
            />
          </Field>
          <SubmitButton className="w-full">{profile.onboarded_at ? "Save" : "Continue"}</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
