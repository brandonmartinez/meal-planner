import { ReactNode } from 'react';
import Navigation from './Navigation';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navigation />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="border-t bg-white py-4 text-center text-xs text-gray-400">
        Meal Planner © 2024
      </footer>
    </div>
  );
}
