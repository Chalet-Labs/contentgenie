"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  updateNotificationPreferences,
  getNotificationPreferences,
} from "@/app/actions/notifications";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationSettings() {
  const [pushPermission, setPushPermission] = useState<
    "default" | "granted" | "denied" | "unsupported"
  >("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [digestFrequency, setDigestFrequency] = useState<
    "realtime" | "daily" | "weekly"
  >("realtime");
  const [isToggling, setIsToggling] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Check if push is supported
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushPermission("unsupported");
    } else {
      setPushPermission(
        Notification.permission as "default" | "granted" | "denied"
      );
    }

    // Load current preferences
    getNotificationPreferences().then((prefs) => {
      setDigestFrequency(prefs.digestFrequency);
      setPushEnabled(prefs.pushEnabled);
      setIsLoaded(true);
    });
  }, []);

  const handleEnablePush = async () => {
    setIsToggling(true);
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission as "default" | "granted" | "denied");

      if (permission !== "granted") {
        toast.error("Push notification permission was denied");
        setIsToggling(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!vapidPublicKey) {
        toast.error("Push notifications are not configured");
        setIsToggling(false);
        return;
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      const serialized = JSON.parse(JSON.stringify(subscription));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: serialized.endpoint,
          keys: serialized.keys,
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save push subscription");
      }

      await updateNotificationPreferences({ pushEnabled: true });
      setPushEnabled(true);
      toast.success("Push notifications enabled");
    } catch (error) {
      console.error("Failed to enable push:", error);
      toast.error("Failed to enable push notifications");
    } finally {
      setIsToggling(false);
    }
  };

  const handleDisablePush = async () => {
    setIsToggling(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const serialized = JSON.parse(JSON.stringify(subscription));

        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: serialized.endpoint }),
        });

        await subscription.unsubscribe();
      }

      await updateNotificationPreferences({ pushEnabled: false });
      setPushEnabled(false);
      toast.success("Push notifications disabled");
    } catch (error) {
      console.error("Failed to disable push:", error);
      toast.error("Failed to disable push notifications");
    } finally {
      setIsToggling(false);
    }
  };

  const handleDigestChange = async (
    value: "realtime" | "daily" | "weekly"
  ) => {
    setDigestFrequency(value);
    const result = await updateNotificationPreferences({
      digestFrequency: value,
    });
    if (result.success) {
      toast.success("Notification frequency updated");
    } else {
      toast.error("Failed to update notification frequency");
    }
  };

  return (
    <div className="space-y-4">
      {/* Push Notifications */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-sm font-medium">Push Notifications</label>
          <p className="text-sm text-muted-foreground">
            Get browser notifications when new summaries are available.
          </p>
          {pushPermission === "denied" && (
            <p className="text-xs text-destructive">
              Push notifications are blocked. Please enable them in your browser
              settings.
            </p>
          )}
          {pushPermission === "unsupported" && (
            <p className="text-xs text-muted-foreground">
              Push notifications are not supported in this browser.
            </p>
          )}
        </div>
        {pushPermission === "denied" || pushPermission === "unsupported" ? (
          <Button variant="outline" disabled>
            {pushPermission === "denied" ? "Blocked" : "Unsupported"}
          </Button>
        ) : pushEnabled && pushPermission === "granted" ? (
          <Button
            variant="outline"
            onClick={handleDisablePush}
            disabled={isToggling}
          >
            {isToggling ? "Disabling..." : "Disable"}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={handleEnablePush}
            disabled={isToggling}
          >
            {isToggling ? "Enabling..." : "Enable"}
          </Button>
        )}
      </div>

      <Separator />

      {/* Digest Frequency */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-sm font-medium">Notification Frequency</label>
          <p className="text-sm text-muted-foreground">
            How often to receive push notification digests.
          </p>
        </div>
        {isLoaded ? (
          <Select value={digestFrequency} onValueChange={handleDigestChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realtime">Realtime</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="h-10 w-[140px] animate-pulse rounded-md bg-muted" />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Note: On iOS Safari, push notifications only work when ContentGenie is
        installed as a PWA (Add to Home Screen, iOS 16.4+).
      </p>
    </div>
  );
}
