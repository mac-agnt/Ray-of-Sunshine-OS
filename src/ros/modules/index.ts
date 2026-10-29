/* Page id → module component. */
import type { ComponentType } from "react";
import Command from "./Command";
import Locations from "./Locations";
import Families from "./Families";
import Children from "./Children";
import Bookings from "./Bookings";
import Transport from "./Transport";
import EarlyYears from "./EarlyYears";
import Camps from "./Camps";
import Billing from "./Billing";
import NCS from "./NCS";
import Enrolment from "./Enrolment";
import Comms from "./Comms";
import Automations from "./Automations";
import Training from "./Training";
import Staff from "./Staff";
import Compliance from "./Compliance";
import Reports from "./Reports";
import Parent from "./Parent";

export const MODULE_VIEWS: Record<string, ComponentType<{ tab: string }>> = {
  Command, Locations, Families, Children, Bookings, Transport, EarlyYears, Camps, Billing, NCS,
  Enrolment, Comms, Automations, Training, Staff, Compliance, Reports, Parent,
};
