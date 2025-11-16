$(document).ready(function () {
  $("#current-year").text(new Date().getFullYear());

  $("select").material_select();
  graphArea.start();

  $("#create").click(function () {
    clearTimeouts();
    setTimeout(function () {
      graphArea.generateRandomNodes();
      graphArea.drawAll(unvisitedColour);
      graphArea.resetStats();
    }, delay);
  });

  $("#reset").click(function () {
    clearTimeouts();
    setTimeout(function () {
      graphArea.clear();
      drawUnderlyingEdges();
      graphArea.drawAll(unvisitedColour);
      graphArea.resetStats();
      graphArea.available = true;
      redrawSelection();
    }, delay);
  });

  // Path finding buttons (added in updated UI)
  $("#algo-bfs").click(function () {
    runPathAlgorithm(bfsSearch);
  });
  $("#algo-dfs").click(function () {
    runPathAlgorithm(dfsSearch);
  });
  $("#algo-astar").click(function () {
    runPathAlgorithm(aStarSearch);
  });
  $("#clear-selection").click(function () {
    clearSelections();
  });

  enableSelection();
});

var visitedColour = "#4CAF50";
var unvisitedColour = "#FF8A80";
var checkColour = "#5C6BC0";
// Additional colours for path-finding visualisation
var startColour = "#2E7D32"; // green
var goalColour = "#1565C0"; // blue
var frontierColour = "#FFD54F"; // yellow
var exploredColour = "#90A4AE"; // grey-blue
var pathColour = "#E53935"; // red
// Base animation delay (ms per step)
var delay = 400;
var graphLoop; //Interval for certain algorithms.
var startNodeSelected = null;
var goalNodeSelected = null;
var adjacency = null; // adjacency list built from k-nearest neighbours
var kNearest = 4; // degree of each node for sparse graph

var graphArea = {
  start: function () {
    this.canvas = $("#graph-view")[0];
    this.context = this.canvas.getContext("2d");
    this.context.lineWidth = 2;
    this.nodeSet = [];
    this.nodeSize = 10;
    this.generateRandomNodes();
  },
  clear: function () {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },
  drawAll: function (colour) {
    for (var i = 0; i < this.nodeSet.length; i++) {
      this.nodeSet[i].update(colour);
    }
  },
  resetStats: function () {
    graphStats.setValue("");
    graphStats.setName("-");
  },
  generateRandomNodes: function () {
    this.clear();
    this.nodeSet = [];
    this.nodeCount = parseInt($("#select-node-count").val());
    for (var i = 0; i < this.nodeCount; i++) {
      var x = Math.floor(Math.random() * (this.canvas.width - this.nodeSize));
      var y = Math.floor(Math.random() * (this.canvas.height - this.nodeSize));
      graphArea.nodeSet.push(new node(x, y, i));
    }
    this.drawAll(unvisitedColour);
    graphStats.setNodeCount(this.nodeCount);
    this.available = true;
    // Build adjacency and ensure graph is connected by increasing k if needed
    ensureConnectedAdjacency();
    drawUnderlyingEdges();
    resetSelections();
  },
};

var graphStats = {
  setValue: function (value) {
    $("#stat-value").html(value);
  },
  incrementValue: function (value) {
    $("#stat-value").html(parseInt($("#stat-value").html()) + value);
  },
  setNodeCount: function (value) {
    $("#node-count").html(value);
  },
  setName: function (name) {
    $("#stat-name").html(name);
  },
};

var timeouts = []; //Contains all timeout IDs that are possibly running for easier clearing.

// Removed legacy runAlgorithm (MST/etc.) – kept as noop for safety if referenced.
function runAlgorithm() {}

//Clears all active timeouts and intervals.
function clearTimeouts() {
  clearInterval(graphLoop);
  for (var i = 0; i < timeouts.length; i++) {
    clearTimeout(timeouts[i]); //Clears all possibly running timeouts.
  }
  timeouts = []; //Resets timeout array as all timeouts have been cleared.
}

// ===================== Selection & Adjacency Helpers =====================

function enableSelection() {
  var canvas = $("#graph-view");
  canvas.off("click.selection").on("click.selection", function (e) {
    if (!graphArea.nodeSet || graphArea.nodeSet.length === 0) return;
    var rect = this.getBoundingClientRect();
    // Map CSS pixels to canvas coordinate system to handle scaling
    var scaleX = this.width / rect.width;
    var scaleY = this.height / rect.height;
    var x = (e.clientX - rect.left) * scaleX;
    var y = (e.clientY - rect.top) * scaleY;
    var chosen = null;
    for (var i = 0; i < graphArea.nodeSet.length; i++) {
      var n = graphArea.nodeSet[i];
      if (
        x >= n.x &&
        x <= n.x + graphArea.nodeSize &&
        y >= n.y &&
        y <= n.y + graphArea.nodeSize
      ) {
        chosen = n;
        break;
      }
    }
    if (!chosen) return;
    if (!startNodeSelected || (startNodeSelected && goalNodeSelected)) {
      startNodeSelected = chosen;
      goalNodeSelected = null;
    } else if (!goalNodeSelected && chosen.id !== startNodeSelected.id) {
      goalNodeSelected = chosen;
    } else if (chosen.id === startNodeSelected.id) {
      // toggle off start
      startNodeSelected = null;
      goalNodeSelected = null;
    }
    redrawSelection();
  });
}

function resetSelections() {
  startNodeSelected = null;
  goalNodeSelected = null;
  redrawSelection();
}

function clearSelections() {
  resetSelections();
  graphStats.setName("-");
  graphStats.setValue("");
  graphArea.available = true;
}

function redrawSelection() {
  graphArea.clear();
  drawUnderlyingEdges();
  graphArea.drawAll(unvisitedColour);
  if (startNodeSelected) startNodeSelected.update(startColour);
  if (goalNodeSelected) goalNodeSelected.update(goalColour);
  if (startNodeSelected || goalNodeSelected) {
    graphStats.setName("Selection: ");
    var status = [];
    if (startNodeSelected) status.push("Start=" + startNodeSelected.id);
    if (goalNodeSelected) status.push("Goal=" + goalNodeSelected.id);
    graphStats.setValue(status.join(" & "));
  } else {
    graphStats.setName("Selection: ");
    graphStats.setValue("Click a node for Start");
  }
}

function buildAdjacency(kOverride) {
  adjacency = [];
  for (var i = 0; i < graphArea.nodeSet.length; i++) {
    adjacency[i] = [];
    var distances = [];
    for (var j = 0; j < graphArea.nodeSet.length; j++) {
      if (i === j) continue;
      var w = getDistance(graphArea.nodeSet[i], graphArea.nodeSet[j]);
      distances.push({ id: j, w: w });
    }
    distances.sort(function (a, b) {
      return a.w - b.w;
    });
    var kUse = Math.min(kOverride || kNearest, distances.length);
    for (var k = 0; k < kUse; k++) {
      adjacency[i].push(distances[k]);
    }
  }
  // Ensure undirected by mirroring edges
  for (var a = 0; a < adjacency.length; a++) {
    for (var b = 0; b < adjacency[a].length; b++) {
      var nb = adjacency[a][b].id;
      var w = adjacency[a][b].w;
      var exists = false;
      for (var c = 0; c < adjacency[nb].length; c++) {
        if (adjacency[nb][c].id === a) {
          exists = true;
          break;
        }
      }
      if (!exists) adjacency[nb].push({ id: a, w: w });
    }
  }
}

function drawUnderlyingEdges() {
  if (!adjacency) return;
  var ctx = graphArea.context;
  var offset = graphArea.nodeSize / 2;
  ctx.lineWidth = 1;
  for (var i = 0; i < adjacency.length; i++) {
    for (var j = 0; j < adjacency[i].length; j++) {
      var n1 = graphArea.nodeSet[i];
      var n2 = graphArea.nodeSet[adjacency[i][j].id];
      ctx.beginPath();
      ctx.moveTo(n1.x + offset, n1.y + offset);
      ctx.lineTo(n2.x + offset, n2.y + offset);
      ctx.strokeStyle = "#DDD";
      ctx.stroke();
    }
  }
  ctx.lineWidth = 2;
}

// Ensure the graph is connected by increasing k up to a limit if needed
function ensureConnectedAdjacency() {
  var maxK = Math.min(12, graphArea.nodeSet.length - 1);
  var currentK = Math.min(kNearest, maxK);
  buildAdjacency(currentK);
  while (!isConnected() && currentK < maxK) {
    currentK++;
    buildAdjacency(currentK);
  }
  // Update global kNearest to the actual used value for future generations
  kNearest = currentK;
}

function isConnected() {
  if (!adjacency || adjacency.length === 0) return true;
  var visited = new Set([0]);
  var q = [0];
  while (q.length) {
    var u = q.shift();
    var nbrs = adjacency[u] || [];
    for (var i = 0; i < nbrs.length; i++) {
      var v = nbrs[i].id;
      if (!visited.has(v)) {
        visited.add(v);
        q.push(v);
      }
    }
  }
  return visited.size === graphArea.nodeSet.length;
}

// ===================== Path Algorithms =====================

function runPathAlgorithm(algoFn) {
  if (!startNodeSelected || !goalNodeSelected) {
    graphStats.setName("Selection:");
    graphStats.setValue("Pick Start & Goal");
    return;
  }
  if (!adjacency) buildAdjacency();
  graphArea.available = false;
  graphStats.setName("Path:");
  graphStats.setValue("Searching...");
  var result = algoFn(startNodeSelected.id, goalNodeSelected.id);
  animateTraversal(
    result.order,
    result.cameFrom,
    startNodeSelected.id,
    goalNodeSelected.id,
    result.cost,
    result.hops
  );
}

// Breadth-First Search (unweighted shortest path in hops)
function bfsSearch(startId, goalId) {
  var queue = [startId];
  var visited = new Set([startId]);
  var cameFrom = {};
  var order = [startId];
  while (queue.length) {
    var current = queue.shift();
    if (current === goalId) break;
    var neighbors = adjacency[current] || [];
    for (var i = 0; i < neighbors.length; i++) {
      var nid = neighbors[i].id;
      if (!visited.has(nid)) {
        visited.add(nid);
        cameFrom[nid] = current;
        queue.push(nid);
        order.push(nid);
      }
    }
  }
  var path = reconstructPath(cameFrom, startId, goalId);
  return {
    order: order,
    cameFrom: cameFrom,
    cost: pathCost(path),
    hops: path.length ? path.length - 1 : 0,
  };
}

// Depth-First Search (returns first found path, not guaranteed optimal)
function dfsSearch(startId, goalId) {
  var stack = [startId];
  var visited = new Set([startId]);
  var cameFrom = {};
  var order = [startId];
  while (stack.length) {
    var current = stack.pop();
    if (current === goalId) break;
    var neighbors = adjacency[current] || [];
    for (var i = neighbors.length - 1; i >= 0; i--) {
      // reverse for visual consistency
      var nid = neighbors[i].id;
      if (!visited.has(nid)) {
        visited.add(nid);
        cameFrom[nid] = current;
        stack.push(nid);
        order.push(nid);
      }
    }
  }
  var path = reconstructPath(cameFrom, startId, goalId);
  return {
    order: order,
    cameFrom: cameFrom,
    cost: pathCost(path),
    hops: path.length ? path.length - 1 : 0,
  };
}

function aStarSearch(startId, goalId) {
  var open = [startId];
  var cameFrom = {};
  var gScore = { [startId]: 0 };
  var fScore = { [startId]: heuristic(startId, goalId) };
  var closed = new Set();
  var order = [startId];
  while (open.length) {
    var bestIdx = 0;
    for (var i = 1; i < open.length; i++) {
      if ((fScore[open[i]] ?? Infinity) < (fScore[open[bestIdx]] ?? Infinity))
        bestIdx = i;
    }
    var current = open.splice(bestIdx, 1)[0];
    order.push(current);
    if (current === goalId) break;
    closed.add(current);
    var neighbors = adjacency[current] || [];
    for (var k = 0; k < neighbors.length; k++) {
      var nid = neighbors[k].id;
      if (closed.has(nid)) continue;
      var tentative = (gScore[current] ?? Infinity) + neighbors[k].w;
      if (tentative < (gScore[nid] ?? Infinity)) {
        cameFrom[nid] = current;
        gScore[nid] = tentative;
        fScore[nid] = tentative + heuristic(nid, goalId);
        if (open.indexOf(nid) === -1) open.push(nid);
      }
    }
  }
  var path = reconstructPath(cameFrom, startId, goalId);
  return {
    order: order,
    cameFrom: cameFrom,
    cost: pathCost(path),
    hops: path.length ? path.length - 1 : 0,
  };
}

function heuristic(aId, bId) {
  return getDistance(graphArea.nodeSet[aId], graphArea.nodeSet[bId]);
}

function reconstructPath(cameFrom, startId, goalId) {
  var path = [];
  if (startId === goalId) return [startId];
  if (!(goalId in cameFrom)) return path;
  var current = goalId;
  while (current !== undefined && current !== startId) {
    path.push(current);
    current = cameFrom[current];
  }
  path.push(startId);
  path.reverse();
  return path;
}

function pathCost(path) {
  var cost = 0;
  for (var i = 0; i < path.length - 1; i++) {
    cost += getDistance(
      graphArea.nodeSet[path[i]],
      graphArea.nodeSet[path[i + 1]]
    );
  }
  return cost;
}

function animateTraversal(order, cameFrom, startId, goalId, finalCost, hops) {
  graphStats.setValue("Animating...");
  graphArea.clear();
  drawUnderlyingEdges();
  graphArea.drawAll(unvisitedColour);
  startNodeSelected.update(startColour);
  goalNodeSelected.update(goalColour);
  for (var i = 1; i < order.length; i++) {
    (function (idx) {
      timeouts.push(
        setTimeout(function () {
          var nid = order[idx];
          var n = graphArea.nodeSet[nid];
          n.update(frontierColour);
          if (cameFrom[nid] !== undefined) {
            edge(graphArea.nodeSet[cameFrom[nid]], n, exploredColour);
          }
          startNodeSelected.update(startColour);
          goalNodeSelected.update(goalColour);
        }, delay * idx)
      );
    })(i);
  }
  timeouts.push(
    setTimeout(function () {
      var path = reconstructPath(cameFrom, startId, goalId);
      if (!path.length) {
        graphStats.setName("Path:");
        graphStats.setValue("No Path");
        graphArea.available = true;
        return;
      }
      graphStats.setName("Path Cost (dist / hops):");
      graphStats.setValue(finalCost + " / " + hops);
      graphArea.clear();
      drawUnderlyingEdges();
      graphArea.drawAll(unvisitedColour);
      startNodeSelected.update(startColour);
      goalNodeSelected.update(goalColour);
      for (var p = 0; p < path.length - 1; p++) {
        edge(
          graphArea.nodeSet[path[p]],
          graphArea.nodeSet[path[p + 1]],
          pathColour
        );
      }
      graphArea.available = true;
    }, delay * (order.length + 1))
  );
}

//Edge object that connected two distinct nodes in the graph.
function edge(startNode, endNode, colour) {
  var offset = graphArea.nodeSize / 2;
  var ctx = graphArea.context;
  ctx.beginPath();
  ctx.moveTo(startNode.x + offset, startNode.y + offset);
  ctx.lineTo(endNode.x + offset, endNode.y + offset);
  ctx.strokeStyle = colour;
  ctx.stroke();
  startNode.update(colour);
  endNode.update(colour);
}

//Node object containing the position information of a point in the graph.
function node(x, y, id) {
  this.x = x;
  this.y = y;
  this.id = id;
  this.update = function (colour) {
    ctx = graphArea.context;
    ctx.fillStyle = colour;
    ctx.fillRect(this.x, this.y, graphArea.nodeSize, graphArea.nodeSize);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(
      this.x + 2,
      this.y + 2,
      graphArea.nodeSize - 4,
      graphArea.nodeSize - 4
    );
  };
}

//Returns the Euclidean distance between two nodes.
function getDistance(startNode, endNode) {
  return Math.floor(
    Math.sqrt(
      Math.pow(startNode.x - endNode.x, 2) +
        Math.pow(startNode.y - endNode.y, 2)
    )
  );
}
