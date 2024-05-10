// Vertex shader
var VSHADER_CODE = `
  attribute vec3 position;
  attribute vec3 color;
  uniform mat4 Pmatrix;
  uniform mat4 Vmatrix;
  uniform mat4 Mmatrix;
  uniform bool useUniformColor; 
  uniform vec3 u_SphereColor;
  varying vec3 vColor;

  void main() {
      gl_Position = Pmatrix * Vmatrix * Mmatrix * vec4(position, 1.0);
      vColor = useUniformColor ? u_SphereColor : color;
  }
`;

// Fragment shader
var FSHADER_CODE = `
  precision mediump float;
  varying vec3 vColor;

  void main() {
      gl_FragColor = vec4(vColor, 1.0);
  }
`;

// Score and game modes
var userScore = 0;
var win = false;
var endlessMode = false;
var startTime;
var endlessStartTime;
var endlessNumBacteria = 1;

// Bacteria parameters
var bacteriaList = [];
var bacteriaRadius = 4.999999;
var numOfBacteria = 8;
var segments = 100;
var maxRadius = 1.5;
var growthRate = 10;

// Initial rotation angles
var angleY = 0;
var angleX = 0;

// Friction and mouse sensitivity
var friction;
let sensitivity = .01;

// WebGL variables
var canvas;
var mo_matrix = [ 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1 ];
var proj_matrix;
var view_matrix;
var vertexBuffer;
const divisions = 50; 
var positionLocation;
var colorLocation;
const radius = 5;
var useUniformColorLocation;
const { vertices, indices } = buildSphere(radius, divisions);
var gl;

function main(numOfBacteria, frictionValue) {
  friction = frictionValue;  
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  canvas = document.getElementById('gl-canvas');
  if (!gl) {
    console.log('Failed to retrieve WebGL context.');
    return;
  }
  if (!initShaders(gl, VSHADER_CODE, FSHADER_CODE)) {
    console.log('Failed to initialize shaders.');
    return;
  }
  gl.enable(gl.DEPTH_TEST);

  // Specify the color for clearing <canvas>
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  useUniformColorLocation = gl.getUniformLocation(gl.program, 'useUniformColor');

  // Viewing volume
  proj_matrix = new Matrix4();
  proj_matrix.setPerspective(80, canvas.width / canvas.clientHeight, 1, 100);
  
  // View matrix
  view_matrix = [ 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1 ];
  view_matrix[14] = view_matrix[14] - 10; // View matrix - move camera away from the object

  positionLocation = gl.getAttribLocation(gl.program, 'position');
  colorLocation = gl.getAttribLocation(gl.program, 'color');
  
  initializeBacteria(numOfBacteria);

  // Register function (event handler) to be called on a mouse press
  canvas.onmousedown = function(ev){ click(ev, canvas); };
  
  startTime = Date.now();
  animate(gl, indices.length, segments);
}

// Track mouse state and last mouse position
var isMouseDown = false;
var lastMouseX = null;
var lastMouseY = null;
var rotationVelocityX = 0;
var rotationVelocityY = 0;

// Function to apply friction and update the rotation
function applyFriction() {
  if (!isMouseDown) {
    const frictionCoefficient = 1 / friction; // Convert to a coefficient less than 1 for reduction
    const stopThreshold = 0.00000000000000000000000001; // When to consider the velocity effectively zero

    // Apply friction
    rotationVelocityX *= frictionCoefficient;
    rotationVelocityY *= frictionCoefficient;

    // Update rotation angles based on the current velocity
    updateRotationX(rotationVelocityX);
    updateRotationY(rotationVelocityY);

    // Clamp small velocities to 0 to prevent endless motion
    if (Math.abs(rotationVelocityX) < stopThreshold) updateRotationX(0);
    if (Math.abs(rotationVelocityY) < stopThreshold) updateRotationY(0);

    // Request the next frame if there's still significant movement
    if (rotationVelocityX !== 0 || rotationVelocityY !== 0) {
      requestAnimationFrame(applyFriction);
    }
  }
}

var withinCanvas;
function updateMousePosition(mousePos){
  withinCanvas = mousePos;
}

// Event listener for mouse down
document.addEventListener('mousedown', function(event) {
  if (event.button === 0 && withinCanvas) { // Left mouse button
    if(rotationVelocityX != 0 || rotationVelocityY != 0){
      rotationVelocityY = 0;
      rotationVelocityX = 0;
      updateRotationX(rotationVelocityY);
      updateRotationY(rotationVelocityX);
    }
    isMouseDown = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    
  }
});

// Event listener for mouse up
document.addEventListener('mouseup', function(event) {
  if (event.button === 0) {
    isMouseDown = false;
    // Start applying friction
    requestAnimationFrame(applyFriction);
  }
});

// Event listener for mouse move
document.addEventListener('mousemove', function(event) {
  if (isMouseDown && withinCanvas) {
    var mouseX = event.clientX;
    var mouseY = event.clientY;

    // Calculate the difference in position
    var deltaX = mouseX - lastMouseX;
    var deltaY = mouseY - lastMouseY;

    // Update the last mouse position for the next move event
    lastMouseX = mouseX;
    lastMouseY = mouseY;

    // Convert mouse movement to rotation velocity
    rotationVelocityY = -deltaX * sensitivity;
    rotationVelocityX = -deltaY * sensitivity;

    // Update rotation angles directly for immediate feedback
    updateRotationX(rotationVelocityX);
    updateRotationY(rotationVelocityY);
  }
});

function click(ev,canvas) { 
  if (gl.isContextLost()) {
      console.log('WebGL context is lost. Recreating...');
      gl = getWebGLContext(canvas);
      if (!gl) {
          console.log('Failed to recreate WebGL context.');
          return;
      }
      console.log('WebGL context recreated successfully.');
  }

  var x = ev.clientX;
  var y = ev.clientY;
  var rect = ev.target.getBoundingClientRect();
  var mouseX = x - rect.left;
  var mouseY = y - rect.top;

  removeBacteriaOnClick(gl, bacteriaList, mouseX, mouseY);
}

function removeBacteriaOnClick(gl, bacteriaList, mouseX, mouseY) {
  // Adjust the click position to the WebGL coordinate system
  const x = mouseX;
  const y = gl.canvas.height - mouseY;  // Flipping the y-axis for WebGL
  // Create a buffer to store the pixel's data
  const pixelData = new Uint8Array(4); // For RGBA

  // Read the pixel data from the canvas
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);

  // Iterate through the bacteriaList to check if the color matches
  for (let i = bacteriaList.length - 1; i >= 0; i--) {
      const bacteria = bacteriaList[i];

      // Convert the bacteria color to 0-255 range for comparison
      const bacteriaColor = bacteria.color.map(c => Math.round(c * 255));

      // Use the isColorMatch function to check color with tolerance
      if (isColorMatch(pixelData, bacteriaColor)) {
          // Remove the bacteria from the list
          bacteriaList.splice(i, 1);
          userScore++; // Increment the score
          document.getElementById('userScore').textContent = userScore.toString(); // Update the score display
          console.log("Bacteria removed!");
          break;
      }
  }
}

function isColorMatch(clickedColor, bacteriaColor, tolerance = 3) {
  // Check if the clicked color is within the tolerance of the bacteria color
  return clickedColor[0] >= bacteriaColor[0] - tolerance && clickedColor[0] <= bacteriaColor[0] + tolerance &&
         clickedColor[1] >= bacteriaColor[1] - tolerance && clickedColor[1] <= bacteriaColor[1] + tolerance &&
         clickedColor[2] >= bacteriaColor[2] - tolerance && clickedColor[2] <= bacteriaColor[2] + tolerance;
}

var lastUpdate = Date.now();
function animate(gl, n, segments) {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  mo_matrix = rotateYMatrix(mo_matrix, angleY);
  mo_matrix = rotateXMatrix(mo_matrix, angleX);

  draw(gl, n);

  const elapsed = Date.now() - startTime;

  // Check if all bacteria are killed
  let allBacteriaKilled = true;
  for (let i = 0; i < numOfBacteria; i++) {
    if (bacteriaList[i] && typeof bacteriaList[i].currentRadius !== 'undefined' && bacteriaList[i].currentRadius <= maxRadius) {
      bacteriaList[i].currentRadius = Math.min(maxRadius, elapsed * growthRate / 100000);
      drawBacteria(gl, bacteriaList[i], segments);
      // If any bacteria exists, the user hasn't won yet
      allBacteriaKilled = false;
    }
  }

  if (allBacteriaKilled) {
    document.getElementById('win').textContent = 'User wins!';
    return;
  }

  // Check if any bacteria reached max size
  for (let i = 0; i < numOfBacteria; i++) {
    if (bacteriaList[i] && bacteriaList[i].currentRadius >= maxRadius) {
      document.getElementById('win').textContent = 'Bacteria win!';
      return;
    }
  }

  // Request next animation frame
  requestAnimationFrame(function () {
    animate(gl, n, segments);
  });
}


function createSphereVertices(radius , divisions) {
  const vertices = [];

  for (let phiIndex = 0; phiIndex <= divisions; phiIndex++) {
      const phi = phiIndex * Math.PI / divisions;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let thetaIndex = 0; thetaIndex <= divisions; thetaIndex++) {
          const theta = thetaIndex * 2 * Math.PI / divisions;
          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);

          const x = radius * sinPhi * cosTheta;
          const y = radius * sinPhi * sinTheta;
          const z = radius * cosPhi;

          vertices.push(x, y, z);
      }
  }

  return vertices;
}

// Create a function to generate vertices, and indices of a sphere
function buildSphere(radius, divisions) {
  let vertices = createSphereVertices(radius, divisions);

  let indices = [];
  for (let lat = 0; lat < divisions; lat++) {
      for (let lon = 0; lon < divisions; lon++) {
          // Calculate indices for the first triangle (top left)
          const first = (lat * (divisions + 1)) + lon;
          const second = first + divisions + 1;
          const third = first + 1;

          // Calculate indices for the second triangle (bottom right)
          const fourth = second;
          const fifth = second + 1;
          const sixth = first + 1;

          indices.push(first, second, third); // First triangle
          indices.push(fourth, fifth, sixth); // Second triangle
      }
  }

  return {
      vertices,
      indices
  };
}

function initializeBacteria(numOfBacteria) {
  for (let i = 0; i < numOfBacteria; i++) {
      const phi = Math.random() * Math.PI; 
      const theta = Math.random() * 2 * Math.PI;
      const x = bacteriaRadius * Math.sin(phi) * Math.cos(theta);
      const y = bacteriaRadius * Math.sin(phi) * Math.sin(theta);
      const z = bacteriaRadius * Math.cos(phi);

      bacteriaList.push({
          position: { x, y, z },
          color: [Math.random(), Math.random(), Math.random()],
          currentRadius: 0,
          creationTime: Date.now()
      });
  }
}

function drawBacteria(gl, bacterium, segments) {
  const bacVertices = [];
  const bacColors = [];

  // Calculate the normal vector at the bacterium's position
  const normal = normalize({ x: bacterium.position.x, y: bacterium.position.y, z: bacterium.position.z });

  for (let i = 0; i < segments; i++) {
    const angle = 2 * Math.PI * i / segments;
    // Calculate local offsets for circular shape
    const offsetX = bacterium.currentRadius * Math.cos(angle);
    const offsetY = bacterium.currentRadius * Math.sin(angle);

    // Align the circle to be tangent to the sphere at the bacterium's position
    // Find tangent vectors
    const tangent1 = normalize(cross(normal, {x: 0, y: 0, z: 1}));
    const tangent2 = normalize(cross(normal, tangent1));

    // Position the vertices of the bacteria circle using the tangent vectors
    const vertex = {
        x: bacterium.position.x + offsetX * tangent1.x + offsetY * tangent2.x,
        y: bacterium.position.y + offsetX * tangent1.y + offsetY * tangent2.y,
        z: bacterium.position.z + offsetX * tangent1.z + offsetY * tangent2.z
    };

    bacVertices.push(vertex.x, vertex.y, vertex.z);
    bacColors.push(...bacterium.color);
  }

  gl.uniform1i(useUniformColorLocation, false);
  var bacVertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bacVertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bacVertices), gl.STATIC_DRAW);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionLocation);

  var bacColorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bacColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bacColors), gl.STATIC_DRAW);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(colorLocation);

  gl.drawArrays(gl.TRIANGLE_FAN, 0, segments);
}

function transformCoordinatesToSphere(centerX, centerY, centerZ, localX, localY, localZ) {
  // Translate local bacterium coordinates to global space
  const x = centerX + localX;
  const y = centerY + localY;
  const z = centerZ + localZ;

  // Normalization is not strictly necessary here if we're just offsetting local coords
  return { x, y, z };
}

function draw(gl, n) {
  // Create a buffer object for vertices
  vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) {
    console.log('Failed to create the buffer object for vertices');
    return -1;
  }
  // Bind the buffer object to target
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  // Write the vertices data to the buffer object
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  // Assign the buffer object to the position variable
  const a_Position = gl.getAttribLocation(gl.program, 'position');
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
  // Enable the assignment to a_Position variable
  gl.enableVertexAttribArray(a_Position);

  // Create a buffer object for vertex colors
  const colorBuffer = gl.createBuffer();
  if (!colorBuffer) {
    console.log('Failed to create the buffer object for colors');
    return -1;
  }

  // Assign the buffer object to the color variable
  const a_Color = gl.getAttribLocation(gl.program, 'color');
    // Create the sphere's color array
  let sphereColors = [];
  for (let i = 0; i < vertices.length / 3; i++) {
      sphereColors.push(1.0, 1.0, 1.0); 
  }

  // Bind and set the color buffer data
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereColors), gl.STATIC_DRAW);

  // Point the attribute to the current bound buffer (colorBuffer)
  gl.vertexAttribPointer(a_Color, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_Color);

  // Create a buffer object for indices
  const indexBuffer = gl.createBuffer();
  if (!indexBuffer) {
    console.log('Failed to create the buffer object for indices');
    return -1;
  }
  // Bind the buffer object to target
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  // Write the indices data to the buffer object
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  // Specify the color for the sphere, e.g., white
  var sphereColor = [0.5, 0.5, 0.5]; // Solid color for the sphere

  // Get the storage locations of uniform variables
  const u_Pmatrix = gl.getUniformLocation(gl.program, 'Pmatrix');
  const u_Vmatrix = gl.getUniformLocation(gl.program, 'Vmatrix');
  const u_Mmatrix = gl.getUniformLocation(gl.program, 'Mmatrix');
  const u_SphereColor = gl.getUniformLocation(gl.program, 'u_SphereColor');

  // Pass the matrix values to the shaders
  gl.uniformMatrix4fv(u_Pmatrix, false, proj_matrix.elements);
  gl.uniformMatrix4fv(u_Vmatrix, false, view_matrix);
  gl.uniformMatrix4fv(u_Mmatrix, false, mo_matrix);

  // When drawing the sphere
  gl.uniform1i(useUniformColorLocation, true);
  gl.uniform3fv(u_SphereColor, sphereColor); 

  
  // Draw the sphere
  gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0);
}

function normalize(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross(v1, v2) {
  return {
      x: v1.y * v2.z - v1.z * v2.y,
      y: v1.z * v2.x - v1.x * v2.z,
      z: v1.x * v2.y - v1.y * v2.x
  };
}

function rotateYMatrix(matrix, angle) {
  var c = Math.cos(angle);
  var s = Math.sin(angle);

  var rotY = [
      c, 0, s, 0,
      0, 1, 0, 0,
     -s, 0, c, 0,
      0, 0, 0, 1
  ];

  return multiplyMatrices(matrix, rotY);
}

function rotateXMatrix(matrix, angle) {
  var c = Math.cos(angle);
  var s = Math.sin(angle);

  var rotX = [
      1,  0,  0, 0,
      0,  c, -s, 0,
      0,  s,  c, 0,
      0,  0,  0, 1
  ];

  return multiplyMatrices(matrix, rotX);
}

function multiplyMatrices(a, b) {
  var result = [];
  for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
          var sum = 0;
          for (var k = 0; k < 4; k++) {
              sum += a[i * 4 + k] * b[k * 4 + j];
          }
          result[i * 4 + j] = sum;
      }
  }
  return result;
}

function updateRotationX(newAngleX) {
    angleX = newAngleX;
}

function updateRotationY(newAngleY) {
    angleY = newAngleY;
}
