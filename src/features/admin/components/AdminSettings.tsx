import { AccessPasswords } from "./AccessPasswords";
import { TemplateEditor } from "./TemplateEditor";

export function AdminSettings() {
  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-10">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Administration</p>
        <h1 className="mt-1 text-4xl">Settings</h1>
      </div>
      <TemplateEditor />
      <AccessPasswords />
    </main>
  );
}
