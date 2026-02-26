import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Menu, X, Sun, Moon, MapPin, Navigation } from "lucide-react";

const Navbar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : true
  );

  useEffect(() => {
    // initialize dark mode class if not present
    if (typeof document !== "undefined") {
      if (isDark) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark((s) => !s);

  const navLinks = [
    { id: "home", label: "Home" },
    { id: "graph", label: "Graph" },
    { id: "controls", label: "Optimize" },
    { id: "results", label: "Results" },
    { id: "about", label: "About" },
  ];

  const handleNavClick = (id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-x-0 top-4 z-30 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-7xl px-4">
        <div className="glass-card-dark backdrop-blur-lg border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className="flex items-center cursor-pointer"
              onClick={() => handleNavClick("home")}
            >
              <Navigation className="text-electric-400" />
              <span className="ml-2 font-bold text-lg gradient-text">
                AEVION
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-6">
            {navLinks.map((l) => (
              <button
                key={l.id}
                onClick={() => handleNavClick(l.id)}
                className="text-sm text-gray-200 hover:text-white transition-colors"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center space-x-3">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="btn-glass px-3 py-2 text-sm flex items-center"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setOpen((s) => !s)}
                aria-label="Toggle menu"
                className="btn-glass p-2 rounded-lg"
              >
                {open ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu panel */}
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 md:hidden"
          >
            <div className="glass-card-dark rounded-xl p-4 space-y-3 border border-white/10">
              {navLinks.map((l) => (
                <button
                  key={l.id}
                  onClick={() => handleNavClick(l.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/5"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.header>
  );
};

export default Navbar;
