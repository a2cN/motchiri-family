import Link from "next/link";
import { PortalHeader, Main } from "@/components/site-header";
import { portalModules } from "@/modules/registry";

export default function Home() {
  return (
    <>
      <PortalHeader />
      <Main>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
          {portalModules.map((m) => (
            <li key={m.id}>
              <Link
                href={m.href}
                className="flex min-h-28 items-center justify-between rounded-lg bg-primary p-5 text-xl font-bold text-primary-foreground no-underline shadow-card active:bg-accent"
              >
                <span>{m.name}</span>
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </Main>
    </>
  );
}
