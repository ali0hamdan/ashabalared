import { ShellLayout } from '@/layouts/ShellLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { BeneficiariesPage } from '@/pages/BeneficiariesPage';
import { BeneficiaryDetailPage } from '@/pages/BeneficiaryDetailPage';
import { BeneficiaryNewPage } from '@/pages/BeneficiaryNewPage';
import { BeneficiariesHistoryPage } from '@/pages/BeneficiariesHistoryPage';
import { CategoriesPage } from '@/pages/CategoriesPage';
import { StockPage } from '@/pages/StockPage';
import { DistributionsPage } from '@/pages/DistributionsPage';
import { DeliveryByAreaPage } from '@/pages/DeliveryByAreaPage';
import { WeeklyTrackingPage } from '@/pages/WeeklyTrackingPage';
import { DistributionNewPage } from '@/pages/DistributionNewPage';
import { UsersPage } from '@/pages/UsersPage';
import { AuditPage } from '@/pages/AuditPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RequireAuth } from '@/routes/RequireAuth';
import { RequireRole } from '@/routes/RequireRole';
import { useAuthStore } from '@/store/auth';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/store/theme';

function ThemedToaster() {
  const mode = useThemeStore((s) => s.mode);
  return <Toaster richColors position="top-center" theme={mode === 'dark' ? 'dark' : 'light'} />;
}

function DocumentTitle() {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    document.title = t('brand.header');
  }, [t, i18n.language]);
  return null;
}

function HomeRedirect() {
  const token = useAuthStore((s) => s.accessToken);
  return <Navigate to={token ? '/app/dashboard' : '/login'} replace />;
}

export default function App() {
  return (
    <>
      <DocumentTitle />
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<ShellLayout />}>
            <Route path="/app/dashboard" element={<DashboardPage />} />
            <Route path="/app/beneficiaries" element={<BeneficiariesPage />} />
            <Route path="/app/beneficiaries/new" element={<BeneficiaryNewPage />} />
            <Route path="/app/beneficiaries/:id" element={<BeneficiaryDetailPage />} />
            <Route path="/app/beneficiaries-history" element={<BeneficiariesHistoryPage />} />
            <Route
              path="/app/categories"
              element={
                <RequireRole allow={['SUPER_ADMIN', 'ADMIN']}>
                  <CategoriesPage />
                </RequireRole>
              }
            />
            <Route
              path="/app/stock"
              element={
                <RequireRole allow={['SUPER_ADMIN', 'ADMIN']}>
                  <StockPage />
                </RequireRole>
              }
            />
            <Route path="/app/distributions" element={<DistributionsPage />} />
            <Route path="/app/delivery-by-area" element={<DeliveryByAreaPage />} />
            <Route path="/app/weekly-tracking" element={<WeeklyTrackingPage />} />
            <Route
              path="/app/distributions/new"
              element={
                <RequireRole allow={['SUPER_ADMIN', 'ADMIN']}>
                  <DistributionNewPage />
                </RequireRole>
              }
            />
            <Route path="/app/users" element={<UsersPage />} />
            <Route path="/app/audit" element={<AuditPage />} />
            <Route path="/app/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ThemedToaster />
    </>
  );
}
