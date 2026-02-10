"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CompanyAdminCardProps = {
  canManage?: boolean;
};

export function CompanyAdminCard({ canManage = true }: CompanyAdminCardProps) {
  if (!canManage) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Administrare mutata</CardTitle>
        <CardDescription>Companiile si userii se gestioneaza acum din meniul lateral.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/companies">Companii</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/users">Useri</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default CompanyAdminCard;
