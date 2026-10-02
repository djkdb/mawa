import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function Slide({ id, active, children, align = 'center' }: { id: string; active: boolean; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <section id={id} className="slide flex items-center justify-center px-6 sm:px-10" aria-hidden={!active}>
      <motion.div
        initial={false}
        animate={{ opacity: active ? 1 : 0.15, y: active ? 0 : 24, filter: active ? 'blur(0px)' : 'blur(2px)' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`w-full max-w-6xl ${align === 'start' ? 'self-start pt-20 sm:pt-24' : ''}`}
      >
        {children}
      </motion.div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-accent">{children}</p>;
}

export function Title({ children, size = 'lg' }: { children: ReactNode; size?: 'lg' | 'xl' }) {
  return <h2 className={`mt-4 font-semibold leading-[1.05] tracking-tight text-white ${size === 'xl' ? 'text-5xl sm:text-7xl lg:text-8xl' : 'text-4xl sm:text-5xl lg:text-6xl'}`}>{children}</h2>;
}
