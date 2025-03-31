# Eternauta 3D

A 3D web-based game inspired by the Argentine comic series "El Eternauta", featuring a post-apocalyptic world with snow, procedural city generation, and dynamic character movement.

## Description

This project is a Three.js-based 3D game that puts you in the role of a character navigating through a procedurally generated cityscape. The game features dynamic weather effects, infinite terrain, and responsive character controls.

### Features

- **Dynamic Character Movement**: Smooth character animation with walk/idle states
- **Procedural City Generation**: Buildings are generated dynamically as you explore
- **Weather Effects**: Dynamic snow particle system
- **Infinite Ground**: Seamless terrain that generates as you move
- **Responsive Controls**: WASD movement with smooth camera following
- **Performance Monitoring**: Built-in FPS counter and performance stats
- **Dynamic Lighting**: Multiple light sources including character-following spotlight
- **Collision Detection**: Prevent walking through buildings
- **Fog Effects**: Atmospheric depth with dynamic fog

## Setup Instructions

1. **Prerequisites**
   - Node.js (v14 or higher)
   - npm or yarn

2. **Installation**
   ```bash
   # Clone the repository
   git clone [repository-url]
   cd eternauta

   # Install dependencies
   npm install
   # or
   yarn install
   ```

3. **Development**
   ```bash
   # Start the development server
   npm run dev
   # or
   yarn dev
   ```

4. **Build**
   ```bash
   # Create a production build
   npm run build
   # or
   yarn build
   ```

## Controls

- **W**: Move forward
- **S**: Move backward
- **A**: Rotate left
- **D**: Rotate right

## Technical Details

- Built with React and Three.js
- Uses FBX models for character animations
- Implements procedural generation for city and terrain
- Features dynamic lighting and shadow systems
- Includes performance monitoring tools

## Project Structure

```
eternauta/
├── src/
│   ├── components/
│   │   └── Scene3D.jsx    # Main 3D scene component
│   ├── App.jsx
│   └── main.jsx
├── public/
│   └── assets/           # 3D models and textures
├── package.json
└── README.md
```

## Dependencies

- three
- react
- react-dom
- vite
- @vitejs/plugin-react

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 