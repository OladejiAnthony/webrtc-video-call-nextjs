// src/pages/_app.tsx
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import io from 'socket.io-client';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Initialize socket connection
    // const socket = io({
    //   path: '/api/socket.io',
    //   transports: ['websocket'], // Force WebSocket transport
    // });

    const socket = io('https://peer.agregartech.com/', {
      path: '/socket.io',
      transports: ['websocket']
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;