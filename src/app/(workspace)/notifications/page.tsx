import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <span
      className={
        readAt
          ? "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
          : "rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700"
      }
    >
      {readAt ? "Citita" : "Necitita"}
    </span>
  );
}

export default async function NotificationsPage() {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context) {
    redirect("/login");
  }
  const { workspaceId, email } = context;

  const notifications = await listNotificationsForUser({ workspaceId, email, limit: 100 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notificari</h1>
          <p className="text-sm text-slate-600">Alerte in-app pentru reminder, reasignare si manager alert.</p>
        </div>
        <form action="/api/notifications/read-all?redirectTo=/notifications" method="POST">
          <Button type="submit" variant="outline">
            Marcheaza toate ca citite
          </Button>
        </form>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Flux notificari</CardTitle>
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
                  <p className="mt-1 text-xs text-slate-500">
                    {notification.type} · {formatDateTime(notification.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
