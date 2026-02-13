"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock3,
  ExternalLink,
  User,
} from "lucide-react";

export type TodayBookingItem = {
  id: string;
  leadId: string;
  time: string;
  leadName: string;
  meetingType: string;
  status: "confirmed" | "pending";
};

type TodayBookingsCardProps = {
  bookings: TodayBookingItem[];
};

export function TodayBookingsCard({ bookings }: TodayBookingsCardProps) {
  const router = useRouter();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-green-500" />
          <h2 className="text-lg font-fraunces font-bold text-slate-900">Programari Astazi</h2>
        </div>

        <Link
          href="/calendar"
          className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 transition-colors duration-200 hover:text-orange-700"
        >
          Vezi Calendar Complet
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="py-6 text-center">
          <Calendar className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">Nicio programare astazi</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              onClick={() => router.push(`/leads/${booking.leadId}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/leads/${booking.leadId}`);
                }
              }}
              tabIndex={0}
              role="link"
              aria-label={`Deschide lead ${booking.leadName}`}
              className="cursor-pointer rounded-lg border border-slate-100 p-3 transition-all duration-200 hover:border-green-300 hover:bg-green-50"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="flex items-center gap-1 text-sm font-bold text-slate-900">
                    <Clock3 className="h-4 w-4 text-slate-400" />
                    {booking.time}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <User className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    <p className="truncate text-sm font-semibold text-slate-900">{booking.leadName}</p>
                  </div>
                  <p className="text-xs text-slate-600">{booking.meetingType}</p>
                </div>

                <div className="flex-shrink-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    {booking.status === "confirmed" ? (
                      <>
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="text-green-700">Confirmat</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                        <span className="text-amber-700">Pending</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function TodayBookingsCardSkeleton() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-100 p-3">
            <div className="space-y-2">
              <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
