import { redirect } from "next/navigation";
import { Bell, AlertCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUserAndWorkspace } from "@/server/authMode";
import { listNotificationsForUser } from "@/server/services/notificationService";

function formatDateTime(value: Date) {
  const date = new Date(value);
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function NotificationBadge({ readAt }: { readAt: Date | null }) {
  return (
    <Badge variant={readAt ? "gray" : "orange"}>
      {readAt ? "Citita" : "Necitita"}
    </Badge>
  );
}

function getNotificationTypeBadgeVariant(type: string): "gray" | "orange" | "green" | "red" | "blue" {
  if (type.includes("BREACH")) return "red";
  if (type.includes("ESCALATION")) return "orange";
  if (type.includes("BOOKING")) return "green";
  if (type.includes("NEW_LEAD")) return "blue";
  if (type.includes("HANDOVER")) return "blue";
  return "gray";
}

export default async function NotificationsPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  const { workspaceId, email } = context;

  const notifications = await listNotificationsForUser({ workspaceId, email, limit: 100 });

  // Calculate stats from notifications
  const unreadNotifications = notifications.filter((n) => !n.readAt);
  const criticalNotifications = notifications.filter(
    (n) => n.type.includes("BREACH") || n.type.includes("ESCALATION")
  );
  const readNotifications = notifications.filter((n) => n.readAt);

  const stats = {
    unread: unreadNotifications.length,
    critical: criticalNotifications.length,
    read: readNotifications.length,
  };

  return (
    <div className="space-y-6">
      {/* Header cu icon */}
      <PageHeader
        title="Notificari"
        subtitle="Alerte in-app pentru reminder, reasignare si manager alert."
        icon={Bell}
        actions={
          <form action="/api/notifications/read-all?redirectTo=/notifications" method="POST">
            <Button type="submit" variant="outline">
              Marcheaza toate ca citite
            </Button>
          </form>
        }
      />

      {/* Stat Cards - REAL DATA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Bell}
          label="Notificări Noi"
          value={stats.unread}
        />

        <StatCard
          icon={AlertCircle}
          label="Alerte Critice"
          value={stats.critical}
          helper="breach + escalation"
        />

        <StatCard
          icon={CheckCircle}
          label="Citite"
          value={stats.read}
          helper={`din ${notifications.length} total`}
        />
      </div>

      <Card className="border-t-4 border-t-orange-500 rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-fraunces font-bold text-slate-900">
            Flux notificari
          </CardTitle>
          <CardDescription className="text-slate-600">
            Lista este ordonata descrescator dupa data crearii.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-600">Nu exista notificari.</p>
          ) : (
            <ul className="space-y-2">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={
                    notification.readAt
                      ? "rounded-xl border border-slate-200 bg-white px-3 py-2"
                      : "rounded-xl border border-orange-200 bg-orange-50/40 px-3 py-2"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                      <p className="text-sm text-slate-600">{notification.body}</p>
                    </div>
                    <NotificationBadge readAt={notification.readAt} />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={getNotificationTypeBadgeVariant(notification.type)}>
                      {notification.type}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {formatDateTime(notification.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
