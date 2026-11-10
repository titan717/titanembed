import "@fontsource-variable/inter/wght.css";
import "./embed.css";
import { startEmbed } from "@titan/embed";

startEmbed(document.getElementById("player")!, new URLSearchParams(location.search));
