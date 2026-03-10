import { useState } from "react";
import { Sidebar, Page } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { CacheCleaner } from "./components/CacheCleaner";
import { JunkFiles } from "./components/JunkFiles";
import { Images } from "./components/Images";
import { Duplicates } from "./components/Duplicates";
import { LargeFiles } from "./components/LargeFiles";
import { Applications } from "./components/Applications";
import { NodeModules } from "./components/NodeModules";
import { Startup } from "./components/Startup";
import { Maintenance } from "./components/Maintenance";
import { SystemData } from "./components/SystemData";
import { Processes } from "./components/Processes";
import "./App.css";

function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <>
      <Sidebar activePage={page} onNavigate={setPage} />
      {page === "dashboard" && <Dashboard />}
      {page === "caches" && <CacheCleaner />}
      {page === "junk-files" && <JunkFiles />}
      {page === "images" && <Images />}
      {page === "duplicates" && <Duplicates />}
      {page === "large-files" && <LargeFiles />}
      {page === "applications" && <Applications />}
      {page === "node-modules" && <NodeModules />}
      {page === "startup" && <Startup />}
      {page === "maintenance" && <Maintenance />}
      {page === "system-data" && <SystemData />}
      {page === "processes" && <Processes />}
    </>
  );
}

export default App;
