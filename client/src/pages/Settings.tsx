import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Key, Bell, Shield, Save, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Settings as SettingsType } from "@shared/schema";

export default function Settings() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [localSettings, setLocalSettings] = useState({
    scanDepth: "medium",
    autoScan: false,
    emailNotifications: true,
  });

  const { data: settings, isLoading } = useQuery<SettingsType & { apiKey: string }>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        scanDepth: settings.scanDepth || "medium",
        autoScan: settings.autoScan || false,
        emailNotifications: settings.emailNotifications ?? true,
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<SettingsType>) => {
      const response = await apiRequest("PATCH", "/api/settings", updates);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings Saved",
        description: "Your preferences have been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/settings/regenerate-key");
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "API Key Regenerated",
        description: "Your new API key has been generated",
      });
    },
  });

  const handleSaveSettings = () => {
    updateMutation.mutate(localSettings);
  };

  const handleCopyKey = () => {
    if (settings?.apiKey) {
      navigator.clipboard.writeText(settings.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied",
        description: "API key copied to clipboard",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-settings">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-settings">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <div className="grid gap-6">
        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              API Configuration
            </CardTitle>
            <CardDescription>
              Your unique API key protects your reports and scans from unauthorized access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 border border-primary/20 rounded-lg p-3 text-sm text-muted-foreground">
              Your API key is required to access and download your vulnerability reports. Keep it private and never share it publicly.
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">Your API Key (Private)</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type="password"
                  value={settings?.apiKey || ""}
                  readOnly
                  className="font-mono"
                  data-testid="input-api-key"
                />
                <Button 
                  variant="secondary" 
                  size="icon"
                  onClick={handleCopyKey}
                  data-testid="button-copy-key"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => regenerateKeyMutation.mutate()}
                  disabled={regenerateKeyMutation.isPending}
                  data-testid="button-regenerate-key"
                >
                  Regenerate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this key to authenticate API requests
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Scan Settings
            </CardTitle>
            <CardDescription>
              Configure default scanning behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Default Scan Depth</Label>
              <Select 
                value={localSettings.scanDepth} 
                onValueChange={(value) => setLocalSettings(prev => ({ ...prev, scanDepth: value }))}
              >
                <SelectTrigger className="w-full md:w-64" data-testid="select-scan-depth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shallow">Shallow - Quick scan</SelectItem>
                  <SelectItem value="medium">Medium - Standard scan</SelectItem>
                  <SelectItem value="deep">Deep - Comprehensive scan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-scan">Auto-scan new URLs</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically start scanning when a new URL is added
                </p>
              </div>
              <Switch
                id="auto-scan"
                checked={localSettings.autoScan}
                onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, autoScan: checked }))}
                data-testid="switch-auto-scan"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>
              Control how you receive alerts and updates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-notifications">Email Notifications</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Receive email alerts when scans complete
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={localSettings.emailNotifications}
                onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, emailNotifications: checked }))}
                data-testid="switch-email-notifications"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button 
            onClick={handleSaveSettings} 
            disabled={updateMutation.isPending}
            data-testid="button-save-settings"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
