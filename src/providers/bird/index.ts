import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import { BirdNotificationProviderService } from "./service";

export { BirdNotificationProviderService };
export default ModuleProvider(Modules.NOTIFICATION, {
  services: [BirdNotificationProviderService],
});
