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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Key, Bell, Shield, Save, Copy, Check, Trash2, User as UserIcon, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Settings as SettingsType } from "@shared/schema";

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [confirmUsername, setConfirmUsername] = useState("");
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

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/auth/delete-account");
    },
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Your account and all associated data have been permanently removed.",
      });
      logout();
      window.location.href = "/login";
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
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

        <Card className="bg-card border-card-border border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <UserIcon className="w-5 h-5" />
              Account Management
            </CardTitle>
            <CardDescription>
              Manage your personal account and data portability
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Username</Label>
                <p className="text-sm font-medium mt-1">{user?.username || "Loading..."}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>
                Sign Out
              </Button>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-semibold text-destructive">Danger Zone</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Deleting your account will permanently remove all your scans, reports, and settings. This action cannot be undone.
                    </p>
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full sm:w-auto">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete My Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-4 pt-2">
                        <p>
                          This action will permanently delete the account for <strong>{user?.username}</strong> and all associated data.
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="confirm-username">Type your username to confirm:</Label>
                          <Input
                            id="confirm-username"
                            placeholder={user?.username}
                            value={confirmUsername}
                            onChange={(e) => setConfirmUsername(e.target.value)}
                            autoComplete="off"
                          />
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setConfirmUsername("")}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteAccountMutation.mutate()}
                        disabled={confirmUsername !== user?.username || deleteAccountMutation.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleteAccountMutation.isPending ? "Deleting..." : "Permanently Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
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
