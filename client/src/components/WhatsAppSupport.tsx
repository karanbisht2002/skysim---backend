
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

export function WhatsAppSupport() {
    const { data: settings } = useQuery<any>({
        queryKey: ['/api/public/settings'],
        queryFn: async () => {
            const res = await fetch('/api/public/settings');
            const json = await res.json();
            return json.data;
        },
        staleTime: 1000 * 60 * 10,
    });

    if (!settings || (settings.whatsapp_show !== 'true' && settings.whatsapp_show !== true)) {
        return null;
    }

    const whatsappNumber = settings.whatsapp_number || '';
    if (!whatsappNumber) return null;

    // Clean the number and format the link
    const cleanNumber = whatsappNumber.replace(/[^\d]/g, '');
    const whatsappUrl = `https://wa.me/${cleanNumber}`;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ scale: 0, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0, opacity: 0, y: 20 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="fixed bottom-36 right-4 z-[9999]"
            >
                <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative group block"
                >
                    {/* Tooltip */}
                    <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                        <div className="bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white px-4 py-2 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 whitespace-nowrap text-sm font-semibold">
                            Support via WhatsApp
                        </div>
                    </div>

                    {/* Glow Effect */}
                    <div className="absolute inset-0 bg-[#25D366] rounded-full blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-500" />

                    {/* Image Icon Button (No background/border) */}
                    <div className="relative h-12 w-12 flex items-center justify-center transition-all duration-500">
                        <img src="/images/whatsapp-icon.webp"
                            alt="WhatsApp"
                            className="w-14 h-14 object-contain transform transition-transform duration-500 group-hover:scale-110 drop-shadow-lg" loading="lazy" />

                        {/* Subtle Pulsing Ring */}
                        <div className="absolute inset-0 rounded-full border-2 border-[#25D366]/30 animate-ping opacity-20" />
                    </div>
                </a>
            </motion.div>
        </AnimatePresence>
    );
}
