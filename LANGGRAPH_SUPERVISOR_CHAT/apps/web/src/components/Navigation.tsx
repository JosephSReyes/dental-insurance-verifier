'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Home,
  FileText,
  BarChart3,
  Tag,
  CheckSquare,
} from 'lucide-react';

export function Navigation() {
  const pathname = usePathname();

  const links = [
    {
      href: '/',
      label: 'Home',
      icon: Home,
    },
    {
      href: '/review',
      label: 'Review',
      icon: FileText,
    },
    {
      href: '/annotations',
      label: 'Annotations',
      icon: Tag,
      badge: 'New',
    },
    {
      href: '/analytics',
      label: 'Analytics',
      icon: BarChart3,
    },
  ];

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4">
        <div className="flex items-center h-16 space-x-4">
          <div className="flex items-center space-x-2">
            <CheckSquare className="h-6 w-6" />
            <span className="font-bold text-lg">Insurance Verification</span>
          </div>
          <div className="flex-1 flex items-center space-x-1">
            {links.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;

              return (
                <Link key={link.href} href={link.href}>
                  <Button
                    variant={isActive ? 'default' : 'ghost'}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                    {link.badge && (
                      <Badge variant="secondary" className="text-xs ml-1">
                        {link.badge}
                      </Badge>
                    )}
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
