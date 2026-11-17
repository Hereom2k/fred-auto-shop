import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
    plugins: [tailwindcss()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),       // (for netlify build)
                setPassword: resolve(__dirname, 'pages/set-password.html'),
                dashboard: resolve(__dirname, 'pages/dashboard.html'),
                jobs: resolve(__dirname, 'pages/jobs.html'),
                customers: resolve(__dirname, 'pages/customers.html'),
                customerDetails: resolve(__dirname, 'pages/customer-details.html'),
                appointments: resolve(__dirname, 'pages/appointments.html'),
                adminDashboard: resolve(__dirname, 'pages/admin/index.html'),
                adminParts: resolve(__dirname, 'pages/admin/parts.html'),
                adminReports: resolve(__dirname, 'pages/admin/reports.html'),
                adminStaff: resolve(__dirname, 'pages/admin/staff.html'),
            },
        },
    },
})