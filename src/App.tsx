import type { Component } from 'solid-js';
import { onMount } from 'solid-js';

import Paper from "paper";
import styles from './App.module.css';
import { isParenthesizedTypeNode } from 'typescript';

type edge = {
  path: paper.Path,
  start: point,
  end: point
}

type point = {
  location: paper.Point,
  active: boolean,
  region: region,
  shape?: paper.Shape,
  edges: edge[],
  id: number,
}

type region = {
  innerPoints: point[],
  boundaryPoints: point[],
  innerRegions: region[]
}

type game = {
  gameRegion: region,
  allPoints: point[],
  active: boolean
}

const pointCount = 6;
const pointDistributionRadius = 150;
const pointRadius = 10;

const loopTest = (point: point, newNeighbor: point): edge[][] | false => {
  /*
  Determines if a new path has created a loop with a point. newNeighbor should not have point 
  added to its neighbors array until after executing looptest. Returns false if it is not a loop
  or an array of paths creating the loop. 
  */
  let checkedNodes: Set<point> = new Set()
  let paths: edge[][] = [[]];

  const loopTestHelper = (neighbor: point): boolean => {
    /*
    Depth first search on the nodes, DFS since its a little more memory efficient for path storage. 
    */
    let foundPath = false
    if (neighbor === point){
      paths.push(paths[paths.length - 1].slice())
      return true
    }
    if (checkedNodes.has(neighbor)){
      console.log("already checked")
      return false
    }
    checkedNodes.add(neighbor)
    for (let i = 0; i < neighbor.edges.length; i++){
      paths[paths.length - 1].push(neighbor.edges[i]);
      if (loopTestHelper(neighbor.edges[i].end)){
        foundPath = true
      }
      paths[paths.length - 1].pop()
    }
    return foundPath
  }

  if (loopTestHelper(newNeighbor)){
    console.log(paths)
    return paths
  }

  return false
}

const PaperCanvas: Component<{game: game}> = (props) => {
  let canvas: HTMLCanvasElement;

  onMount(() => {
    Paper.setup(canvas)

    let edges: edge[] = [];
    let currentPath: paper.Path;
    let start: point;

    let drawing = false;

    const pathOnDoubleClick = (edge: edge) => (event: paper.MouseEvent) => {
      let circle = new Paper.Shape.Circle(event.point, pointRadius)
      circle.fillColor = new Paper.Color("black");

      let id = props.game.allPoints.length
      let location = event.point
      let region = edge.start.region
      let active = true;

      let p: point = {
        location,
        region,
        active,
        edges: [],
        id,
        shape: circle,
      }

      // Keeps boundary region creation running smoothly
      edge.start.edges = edge.start.edges.filter((e) => e != edge)
      edge.end.edges = edge.end.edges.filter((e) => e.path != edge.path)

      // Creates the edges for the new point
      let newPath = edge.path.splitAt(edge.path.getNearestLocation(event.point))
      
      let edgeStart: edge = {
        path: edge.path,
        start: p,
        end: edge.start
      }
      let edgeEnd: edge = {
        path: newPath,
        start: p,
        end: edge.end
      }

      edge.start.edges.push({path: edge.path, start: edge.start, end: p})
      edge.end.edges.push({path: newPath, start: edge.end, end: p})

      p.edges = [edgeStart, edgeEnd]

      // Maintains intersection detection
      edges.push(edgeStart, edgeEnd);

      circle.onMouseDown = circleOnMouseDown(p)
      circle.onMouseEnter = circleOnMouseEnter(p)

      props.game.allPoints.push(p)
    }

    const circleOnMouseDown = (point: point) => (event: paper.MouseEvent) => {
      if (!props.game.active){
        return
      }
      if (point.edges.length < 3){
        if (currentPath) currentPath.onDoubleClick = null
        currentPath = new Paper.Path();
        currentPath.insertBelow(point.shape!);
        currentPath.strokeColor = new Paper.Color('green');
        currentPath.strokeWidth = 3;
        start = point;
        drawing = true
      }
    };

    const detectGameOver = () => {
      let gameState = props.game;
      let checkQueue = [gameState.gameRegion];

      while (checkQueue.length > 0) {
        let region = checkQueue.pop()

        if (region!.innerPoints.reduce((previousValue, point) => previousValue + Number(point.active), 0)! >= 2){
          return false
        }
        checkQueue.push(...(region!.innerRegions)!)
      }

      return true
    }

    const circleOnMouseEnter = (point: point) => (event: paper.MouseEvent) => {
      if (!drawing){
        return
      }
      drawing = false;

      // If the path is a point to itself, max initial paths allowed is 1. Otherwise its 2.
      let maxPaths = start === point ? 1 : 2;
      if (point.edges.length <= maxPaths) {
        currentPath.add(event.point);
        currentPath.insertBelow(point.shape!)
        currentPath.simplify(10);

        let regionBoundaries = loopTest(start, point)

        if (regionBoundaries){
          regionBoundaries.forEach((boundary) => {
            if (boundary != []){
              let boundaryPath: paper.Path = currentPath.clone()
              boundaryPath.insertBelow(currentPath)
              let boundaryPoints: point[] = [point]
              boundary.forEach((edge) => {
                let n = edge.path.clone()
                boundaryPath.join(n)
                boundaryPath.visible = false
                boundaryPoints.push(edge.end)
              })
              
              let innerPoints: point[] = []

              let newRegion: region = {
                innerPoints: [],
                boundaryPoints: boundaryPoints,
                innerRegions: []
              }
              point.region.innerPoints.forEach((p) => {
                if (!boundaryPath.contains(p.location)){
                  return
                }
                if (point.region != p.region){
                  newRegion.innerRegions.push(p.region)
                  return
                }
                innerPoints.push(p)
                p.region = newRegion
              })

              innerPoints = innerPoints.filter((point) => !(boundaryPoints.includes(point)))

              point.region.innerPoints = point.region.innerPoints.filter((point) => !innerPoints.includes(point))
              
              newRegion.innerPoints = innerPoints
              
              point.region.innerRegions.push(newRegion)
              point.region.innerPoints = point.region.innerPoints.filter((point) => !(innerPoints.includes(point)))
            }
          })
        }

        let mainEdge: edge = {path: currentPath, end: point, start: start}
        point.edges.push({path: currentPath, end: start, start: point});
        start.edges.push(mainEdge);

        mainEdge.path.onDoubleClick = pathOnDoubleClick(mainEdge);
        
        edges.push(mainEdge);


        if (point.edges.length === 3) point.active = false;
        if (start.edges.length === 3) start.active = false;
        
      } else {
        currentPath.removeSegments()
      }

      if (detectGameOver()){
        props.game.active = false

        edges.forEach((edge) => edge.path.strokeColor = new Paper.Color("red"))
      }
    }

    props.game.allPoints.forEach((point) => {
      let circle = new Paper.Shape.Circle(point.location, pointRadius);
      circle.fillColor = new Paper.Color("black");
      point.shape = circle;
      circle.onMouseDown = circleOnMouseDown(point)
      circle.onMouseEnter = circleOnMouseEnter(point)
    })

    Paper.view.onMouseMove = (event: paper.MouseEvent) => {
      if (drawing) {
        currentPath.add(event.point);
        if (currentPath.getIntersections(currentPath).length > 0){
          currentPath.removeSegments();
          drawing = false;
        }

        edges.forEach((edge) => {
          if(edge.path.getIntersections(currentPath).length > 0){
            currentPath.removeSegments();
            drawing = false;
          }
        })
      }
    };

    Paper.view.update()
  })

  return (
    <canvas ref={canvas} width={window.innerWidth} height={window.innerHeight}>
    </canvas>
  );
}

const App: Component = () => {
  let pointsArr: point[] = []

  let gameRegion: region = {
    innerPoints: [],
    boundaryPoints: [],
    innerRegions: []
  }

  for (let i = 0; i < pointCount; i++){
    let p: point;
    let px = Math.sin(i*2*Math.PI/pointCount)*pointDistributionRadius + window.innerWidth/2
    let py = -Math.cos(i*2*Math.PI/pointCount)*pointDistributionRadius + window.innerHeight/2
    p = {
      location: new Paper.Point([px, py]),
      edges: [],
      active: true,
      region: gameRegion,
      id: i,
    }
    pointsArr.push(p);
  }

  gameRegion.innerPoints = pointsArr

  let game = {
    gameRegion: gameRegion,
    allPoints: pointsArr,
    active: true
  }

  return (
    <div class={styles.App}>
      <PaperCanvas game={game} />
    </div>
  );
};

export default App;
