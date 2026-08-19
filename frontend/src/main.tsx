import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'

import { App } from './app/App'
import { queryClient } from './app/queryClient'
import './styles/index.css'

const savedTheme = localStorage.getItem('localtodo-theme') ?? 'system'
document.documentElement.classList.toggle('dark', savedTheme === 'dark' || savedTheme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
