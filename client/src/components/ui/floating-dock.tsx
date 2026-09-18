import { cn } from '@/lib/utils';
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { Link, useLocation } from 'wouter';
import { useRef, useState } from 'react';

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: { title: string; icon: React.ReactNode; href: string }[];
  desktopClassName?: string;
  mobileClassName?: string;
}) => {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
};

const FloatingDockMobile = ({
  items,
  className,
}: {
  items: { title: string; icon: React.ReactNode; href: string }[];
  className?: string;
}) => {
  const [location] = useLocation();

  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-[9999] block md:hidden', className)}>
      <div
        className="
  flex items-center justify-around
  w-full
  px-2 py-2
  bg-white/95 dark:bg-neutral-900/95
  backdrop-blur-xl
  border-t border-neutral-200/50 dark:border-neutral-700/50
  shadow-lg
"
        style={{
          paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        }}
      >
        {items.map((item) => {
          const isActive =
            location === item.href || (item.href !== '/' && location.startsWith(item.href));

          return (
            <Link
              key={item.title}
              href={item.href}
              className="flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1"
              data-testid={`nav-mobile-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200',
                  isActive ? 'bg-primary/15 dark:bg-primary/25' : 'bg-transparent',
                )}
              >
                <div
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isActive ? 'text-primary' : 'text-neutral-500 dark:text-neutral-400',
                  )}
                >
                  {item.icon}
                </div>
              </div>
              <span
                className={cn(
                  'text-[9px] font-medium transition-colors whitespace-nowrap',
                  isActive ? 'text-primary' : 'text-neutral-500 dark:text-neutral-400',
                )}
              >
                {item.title}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const FloatingDockDesktop = ({
  items,
  className,
}: {
  items: { title: string; icon: React.ReactNode; href: string }[];
  className?: string;
}) => {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] hidden h-16 items-end gap-4 rounded-2xl px-4 pb-3 md:flex bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border border-neutral-200/50 dark:border-neutral-700/50 shadow-lg',
        className,
      )}
    >
      {items.map((item) => (
        <IconContainer mouseX={mouseX} key={item.title} {...item} />
      ))}
    </motion.div>
  );
};

function IconContainer({
  mouseX,
  title,
  icon,
  href,
}: {
  mouseX: MotionValue;
  title: string;
  icon: React.ReactNode;
  href: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const isActive = location === href || (href !== '/' && location.startsWith(href));

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-150, 0, 150], [40, 70, 40]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [40, 70, 40]);

  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [20, 35, 20]);
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [20, 35, 20]);

  const width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const widthIcon = useSpring(widthTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const heightIcon = useSpring(heightTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const [hovered, setHovered] = useState(false);

  return (
    <Link href={href} data-testid={`nav-desktop-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <motion.div
        ref={ref}
        style={{ width, height }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'relative flex aspect-square items-center justify-center rounded-full transition-colors',
          isActive
            ? 'bg-primary/15 dark:bg-primary/25'
            : 'bg-neutral-100/80 dark:bg-neutral-800/80',
        )}
      >
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 2, x: '-50%' }}
              className="absolute -top-8 left-1/2 w-fit rounded-md bg-neutral-900 dark:bg-white px-2 py-0.5 text-xs whitespace-pre text-white dark:text-neutral-900 shadow-lg"
            >
              {title}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          style={{ width: widthIcon, height: heightIcon }}
          className={cn(
            'flex items-center justify-center',
            isActive ? '[&>*]:text-primary' : '[&>*]:text-neutral-600 dark:[&>*]:text-neutral-400',
          )}
        >
          {icon}
        </motion.div>
      </motion.div>
    </Link>
  );
}
