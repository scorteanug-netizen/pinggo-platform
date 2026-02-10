import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "./db";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    EmailProvider({
      sendVerificationRequest: async ({ identifier, url }) => {
        if (!resend) {
          console.warn("RESEND_API_KEY not set, magic link:", url);
          return;
        }
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "Pinggo <onboarding@resend.dev>",
          to: identifier,
          subject: "Conectare la Pinggo",
          html: `<p>Apasa aici pentru a te conecta: <a href="${url}">${url}</a></p>`,
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id: string }).id = token.id as string;
      return session;
    },
  },
};
