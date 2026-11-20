import { redirect } from "next/navigation";

// Heat Map now lives inside Statistics.
export default function HeatmapRedirect() {
  redirect("/statistics?tab=heatmap");
}
