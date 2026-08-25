import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPlatform } from "@/platform";

export function SettingsPage() {
  const [platformKind, setPlatformKind] = useState<string>("…");
  const [appVersion, setAppVersion] = useState<string>("…");

  useEffect(() => {
    getPlatform().then(async (platform) => {
      setPlatformKind(platform.kind);
      setAppVersion(await platform.getAppVersion());
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Running as</span>
            <Badge variant="outline">{platformKind === "desktop" ? "Desktop (Tauri)" : "Browser"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">App version</span>
            <span>{appVersion}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">API endpoint</span>
            <span className="font-mono text-xs">{import.meta.env.VITE_API_URL ?? "http://localhost:4000"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Native capabilities</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => (await getPlatform()).notify("Reel Manager", "Notifications are working.")}
          >
            Test notification
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => (await getPlatform()).openExternal("https://www.instagram.com/")}
          >
            Test open external link
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
