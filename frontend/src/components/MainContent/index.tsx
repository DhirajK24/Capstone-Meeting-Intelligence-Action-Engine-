'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';

interface MainContentProps {
  children: React.ReactNode;
}

const MainContent: React.FC<MainContentProps> = ({ children }) => {
  const { isCollapsed } = useSidebar();
  const isHome = usePathname() === '/';

  return (
    <main
      className={`flex-1 min-w-0 overflow-hidden transition-all duration-300 ${
        isCollapsed ? 'ml-16' : 'ml-64'
      }`}
    >
      <div className={`${isHome ? '' : 'pl-8'} min-w-0 w-full max-w-full overflow-hidden`}>
        {children}
      </div>
    </main>
  );
};

export default MainContent;
