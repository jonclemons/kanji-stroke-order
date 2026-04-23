import { createRoute } from "honox/factory";
import { AppShell } from "../components/AppShell";

export default createRoute((c) => {
  return c.render(<AppShell />, { title: "かんじれんしゅう" });
});
