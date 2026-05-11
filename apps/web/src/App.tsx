import { Route, Routes } from 'react-router-dom';
import { AlertsPage } from './components/dashboard/AlertsPage';
import { DocumentationPage } from './components/dashboard/DocumentationPage';
import { NotFoundPage } from './components/dashboard/NotFoundPage';
import { OverviewPage } from './components/dashboard/OverviewPage';
import { ProjectsPage } from './components/dashboard/ProjectsPage';
import { SettingsPage } from './components/dashboard/SettingsPage';
import { AppShell } from './components/layout/AppShell';
import { useApiHealth } from './hooks/use-api-health';
import { useOrganizations } from './hooks/use-organizations';

function OverviewRoute() {
  const health = useApiHealth();
  const organizations = useOrganizations();
  return <OverviewPage health={health} organizations={organizations} />;
}

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewRoute />} />
        <Route path="/docs" element={<DocumentationPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
