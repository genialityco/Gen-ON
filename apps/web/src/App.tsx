import 'dayjs/locale/es';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { theme } from './theme';
import { AuthProvider } from './auth/AuthProvider';
import { HomeRedirect, RequireAuth, RequireOrg } from './auth/guards';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { OrganizationsPage } from './pages/admin/OrganizationsPage';
import { OrganizationPage } from './pages/admin/OrganizationPage';
import { LibraryPage } from './pages/admin/LibraryPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ClinicHomePage } from './pages/clinic/ClinicHomePage';
import { PatientsPage } from './pages/clinic/PatientsPage';
import { SchedulePage } from './pages/clinic/SchedulePage';
import { ProtocolsPage } from './pages/clinic/ProtocolsPage';
import { TemplatesPage } from './pages/clinic/TemplatesPage';
import { TeamPage } from './pages/clinic/TeamPage';
import { ClinicSettingsPage } from './pages/clinic/ClinicSettingsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'es', firstDayOfWeek: 1 }}>
        <Notifications position="top-right" />
        <QueryClientProvider client={queryClient}>
          <ModalsProvider>
            <AuthProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route element={<RequireAuth />}>
                    <Route element={<AppLayout />}>
                      <Route index element={<HomeRedirect />} />
                      <Route element={<RequireAuth roles={['superadmin', 'staff']} />}>
                        <Route path="admin/organizations" element={<OrganizationsPage />} />
                        <Route path="admin/organizations/:orgId/:tab?" element={<OrganizationPage />} />
                        <Route path="admin/library/:tab?" element={<LibraryPage />} />
                      </Route>
                      <Route element={<RequireAuth roles={['superadmin']} />}>
                        <Route path="admin/users" element={<UsersPage />} />
                      </Route>
                      <Route path="org/:orgId" element={<RequireOrg />}>
                        <Route index element={<ClinicHomePage />} />
                        <Route path="patients" element={<PatientsPage />} />
                        <Route path="schedule" element={<SchedulePage />} />
                        <Route path="protocols" element={<ProtocolsPage />} />
                        <Route path="templates" element={<TemplatesPage />} />
                        <Route element={<RequireOrg min="org_admin" />}>
                          <Route path="team" element={<TeamPage />} />
                          <Route path="settings" element={<ClinicSettingsPage />} />
                        </Route>
                      </Route>
                    </Route>
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </AuthProvider>
          </ModalsProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
