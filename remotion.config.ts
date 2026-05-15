import { Config } from "@remotion/cli/config";

// publicDir is passed dynamically per song via --public-dir in render.sh
// so it is NOT set here — each song folder becomes its own asset root
Config.setOverwriteOutput(true);
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
