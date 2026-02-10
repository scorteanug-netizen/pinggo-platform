import { NextRequest, NextResponse } from "next/server";
import { updateWorkspaceSettingsSchema } from "@/lib/validations/settings";
import {
  requirePermission,
  isWorkspaceAccessError,
} from "@/server/authMode";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/server/services/settingsService";

export async function GET() {
  try {
    const { workspaceId } = await requirePermission("canViewSettings");

    const settings = await getWorkspaceSettings(workspaceId);
    if (!settings) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json(settings);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { workspaceId } = await requirePermission("canEditSettings");

    const body = await request.json();
    const parsed = updateWorkspaceSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const settings = await updateWorkspaceSettings(workspaceId, parsed.data);
    if (!settings) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json(settings);
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "INVALID_DEFAULT_FLOW") {
      return NextResponse.json({ error: "Flux implicit invalid pentru acest workspace." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
