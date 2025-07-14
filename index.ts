import add from "./add";
import dup from "./dup";

add.start({
    transportType: "httpStream",
    httpStream: {
      port: 8080,
    },
});

dup.start({
    transportType: "httpStream",
    httpStream: {
      port: 8081,
    },
});
