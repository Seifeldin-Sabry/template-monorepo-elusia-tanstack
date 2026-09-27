import { Button, brand } from "@starter/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CreditCard,
  FolderKanban,
  Layers3,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

const iconStroke = 1.8;

export function AppShell({
  children,
  userName,
}: {
  children: ReactNode;
  userName?: string;
}) {
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setSignOutError(error.message || "Could not sign out. Try again.");
        return;
      }
      queryClient.clear();
      window.location.assign("/login");
    } catch {
      setSignOutError("Could not sign out. Try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Workspace navigation">
        <div className="sidebar-main">
          <Link
            className="brand-lockup"
            to="/"
            aria-label={`${brand.name} workspace home`}
          >
            <span className="brand-mark" aria-hidden="true">
              <Layers3 size={22} strokeWidth={iconStroke} />
            </span>
            <span>{brand.name}</span>
          </Link>

          <div className="sidebar-section-label">Workspace</div>
          <nav aria-label="Primary" className="sidebar-navigation">
            <Link
              className="sidebar-link"
              activeProps={{ className: "sidebar-link sidebar-link-active" }}
              activeOptions={{ exact: true }}
              to="/"
            >
              <FolderKanban
                size={18}
                strokeWidth={iconStroke}
                aria-hidden="true"
              />
              <span>Projects</span>
            </Link>
            <Link
              className="sidebar-link"
              activeProps={{ className: "sidebar-link sidebar-link-active" }}
              to="/billing"
            >
              <CreditCard
                size={18}
                strokeWidth={iconStroke}
                aria-hidden="true"
              />
              <span>Billing</span>
            </Link>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <span className="sidebar-bottom-kicker">Account</span>
          {userName && <p className="sidebar-account-name">{userName}</p>}
          <a href={brand.webUrl} className="sidebar-site-link">
            Visit website
            <ArrowUpRight
              size={15}
              strokeWidth={iconStroke}
              aria-hidden="true"
            />
          </a>
          <Button
            type="button"
            variant="ghost"
            className="signout-button"
            onClick={signOut}
            disabled={isSigningOut}
          >
            <LogOut size={16} strokeWidth={iconStroke} aria-hidden="true" />
            {isSigningOut ? "Signing out…" : "Sign out"}
          </Button>
          {signOutError && (
            <p className="signout-error" role="alert">
              {signOutError}
            </p>
          )}
        </div>
      </aside>

      <div className="app-main-column">
        <header className="app-topbar">
          <div className="mobile-brand">
            <span className="mobile-brand-mark" aria-hidden="true">
              <Layers3 size={17} strokeWidth={iconStroke} />
            </span>
            <span>{brand.name}</span>
          </div>
          <div className="breadcrumb">
            <span>Workspace</span>
          </div>
          <a className="topbar-site-link" href={brand.webUrl}>
            Website
            <ArrowUpRight
              size={16}
              strokeWidth={iconStroke}
              aria-hidden="true"
            />
          </a>
        </header>
        <nav className="mobile-nav" aria-label="Primary">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "mobile-nav-active" }}
          >
            Projects
          </Link>
          <Link to="/billing" activeProps={{ className: "mobile-nav-active" }}>
            Billing
          </Link>
          <button type="button" onClick={signOut} disabled={isSigningOut}>
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
        {signOutError && (
          <div className="mobile-signout-error" role="alert">
            {signOutError}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
