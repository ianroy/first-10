import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "../../styles.css";

export function Preview() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">FIRST TEN / COMPONENT CHECK</p>
          <h1 className="mt-3 text-4xl font-bold">
            Room to listen.
            <br />
            Clarity to decide.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Visual specimens only. No account, save or AI request.
          </p>
        </div>
        <Button variant="outline" onClick={() => setDark(!dark)} aria-pressed={dark}>
          {dark ? "Use light theme" : "Use dark theme"}
        </Button>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>One useful conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="person">First name or role</Label>
              <Input id="person" defaultValue="Maya — fictional example" className="mt-2" />
            </div>
            <div>
              <Label htmlFor="notes">What happened last time?</Label>
              <Textarea
                id="notes"
                className="mt-2"
                defaultValue="The group confirmed in chat. Only one person arrived."
              />
            </div>
            <div>
              <Label htmlFor="channel">Conversation format</Label>
              <Select defaultValue="in-person">
                <SelectTrigger id="channel" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-person">In person</SelectItem>
                  <SelectItem value="video">Video call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="invalid">Example incomplete field</Label>
              <Input
                id="invalid"
                aria-invalid="true"
                aria-describedby="invalid-message"
                className="mt-2"
              />
              <p id="invalid-message" className="mt-2 text-sm text-destructive">
                Add a question before continuing.
              </p>
            </div>
            <div>
              <Label htmlFor="disabled">Example unavailable field</Label>
              <Input
                id="disabled"
                disabled
                value="Unavailable while saving"
                readOnly
                className="mt-2"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button>Next question</Button>
              <Button variant="secondary">Back</Button>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className="bg-warm text-primary-foreground">
            <CardHeader>
              <CardTitle>Your next step</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Ask about the last time this happened.</p>
              <p className="mt-2">Preserve the disagreement. Then choose one small test.</p>
            </CardContent>
          </Card>
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Example error</AlertTitle>
            <AlertDescription>Could not save. Keep this page open and try again.</AlertDescription>
          </Alert>
          <div className="rounded-xl border border-success bg-success-soft p-4 text-success-soft-foreground">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle size={18} aria-hidden="true" />
              Example saved state
            </p>
            <p className="mt-1 text-sm">This is a specimen, not a confirmation of a real save.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge>Reviewed</Badge>
            <Badge variant="destructive">Needs attention</Badge>
            <span className="rounded-md bg-draft px-3 py-1 text-sm font-semibold text-draft-foreground">
              AI draft — check the sources
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() =>
                toast.success("Example notification", {
                  description: "No data was saved by this specimen.",
                })
              }
            >
              Preview saved notice
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                toast.error("Example error", {
                  description: "No request was sent by this specimen.",
                })
              }
            >
              Preview error notice
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled>Unavailable action</Button>
            <Button disabled aria-busy="true">
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Saving…
            </Button>
          </div>
          <p className="text-sm text-success">✓ Standalone success text stays readable.</p>
        </div>
      </div>
      <Toaster />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
