'use client';

import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { TreasuryCard } from '@/app/components/TreasuryCard';
import { DepositCard } from '@/app/components/DepositCard';
import styles from './page.module.css';

type Theme = 'black' | 'gray' | 'white';

export default function TestBalancePage() {
  const [theme, setTheme] = useState<Theme>('black');

  const themeClass =
    theme === 'black' ? styles.black : theme === 'gray' ? styles.gray : styles.white;

  return (
    <main className={`${styles.page} ${themeClass}`}>
      <header className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.logo}>Y</span>
          <span>YieldKeep</span>
        </div>
        <nav className={styles.navLinks}>
          <a className={styles.navActive} href="#">Dashboard</a>
          <a href="#">Assets</a>
          <a href="#">Security</a>
          <a href="#">Docs</a>
        </nav>
        <ConnectButton />
      </header>

      <section className={styles.main}>
        <TreasuryCard />
        <DepositCard />
      </section>

      <div className={styles.themeSwitcher}>
        <button
          className={theme === 'black' ? styles.activeTheme : ''}
          onClick={() => setTheme('black')}
          aria-label="Dark theme"
        >
          ●
        </button>
        <button
          className={theme === 'gray' ? styles.activeTheme : ''}
          onClick={() => setTheme('gray')}
          aria-label="System theme"
        >
          ◐
        </button>
        <button
          className={theme === 'white' ? styles.activeTheme : ''}
          onClick={() => setTheme('white')}
          aria-label="Light theme"
        >
          ○
        </button>
      </div>
    </main>
  );
}